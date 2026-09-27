// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2025~ Yuki Lab
// Copyright 2026 the shogi project contributors
// Modified 2026-09-27: import paths.
// Modified 2026-09-27: writes are compare-and-swap. Upstream read the ratings
//   and the day's game count outside the write transaction, so two results for
//   the same player landing together (two COM tickets, or a COM result next to
//   a human game) could both pass the daily cap and the later absolute UPSERT
//   overwrote the other game's rating. Now every statement in the batch is
//   conditional on the snapshot it was computed from (see `guard`), and a lost
//   race re-reads and recomputes.

// 実力値の読み書き（D1）。計算そのものは rating.ts、対局への当て込みは
// match_room.ts / bot_result.ts。ここは「保存の都合」だけを引き受ける。
//
// 二重適用の防止は rated_game の主キーに任せている。実力値更新は必ず
//   batch([INSERT rated_game, UPSERT player_rating ...])
// の1トランザクションで撃つので、同じ game_key で2回目を撃つと
// バッチごと失敗して1点も動かない（D1 の batch は SQL トランザクション）。
// これで DO alarm の再実行も、COM戦の引換券の再送も、同じ1つの仕組みで弾ける。
//
// 同じ人の結果が同時に2つ届く競合は、スナップショットの「版」で弾く。
// 版 = wins + losses + draws（反映のたびに必ず1だけ増えるので、スキーマを
// 変えずに使える）。行が無い人は「行が無いこと」が版。バッチの各文は
// 「版がスナップショットのまま」かつ「その日の局数がスナップショットのまま」
// のときだけ効く。負けた側は0行で終わるので、読み直して計算し直す。

import {
  applyGame,
  botPairKey,
  BOT_DAILY_LIMIT,
  BOT_RATED_MAX_RANK,
  BOT_SCALE,
  INTERNAL_START,
  jstDateKey,
  pairKey,
  ratingView,
  START_RANK,
  streakScale,
  type RatingOutcome,
  type RatingView,
  type Score,
  visibleRank,
} from "../../../online/rating";

export type PlayerRating = {
  uid: string;
  rating: number;
  bestRank: number;
};

/** A PlayerRating plus the version it was read at (null = no row yet). */
type Snapshot = PlayerRating & { games: number | null };

type Row = { uid: string; rating: number; best_rank: number; games: number };

/** まだ1局も指していない人の初期値。行は作らない（読むだけで書き込まない） */
function freshPlayer(uid: string): PlayerRating {
  return { uid, rating: INTERNAL_START, bestRank: START_RANK };
}

async function loadSnapshots(db: D1Database, uids: string[]): Promise<Map<string, Snapshot>> {
  const wanted = [...new Set(uids.filter((uid) => typeof uid === "string" && uid.length > 0))];
  const found = new Map<string, Snapshot>(wanted.map((uid) => [uid, { ...freshPlayer(uid), games: null }]));
  if (wanted.length === 0) return found;
  const placeholders = wanted.map((_, i) => `?${i + 1}`).join(", ");
  const { results } = await db
    .prepare(
      `SELECT uid, rating, best_rank, wins + losses + draws AS games FROM player_rating WHERE uid IN (${placeholders})`,
    )
    .bind(...wanted)
    .all<Row>();
  for (const row of results ?? []) {
    found.set(row.uid, { uid: row.uid, rating: row.rating, bestRank: row.best_rank, games: row.games });
  }
  return found;
}

export async function loadPlayers(
  db: D1Database,
  uids: string[],
): Promise<Map<string, PlayerRating>> {
  const snapshots = await loadSnapshots(db, uids);
  return new Map([...snapshots].map(([uid, s]) => [uid, { uid: s.uid, rating: s.rating, bestRank: s.bestRank }]));
}

export async function loadPlayer(db: D1Database, uid: string): Promise<PlayerRating> {
  return (await loadPlayers(db, [uid])).get(uid) ?? freshPlayer(uid);
}

/** ロビー用。行が無い人にも 5級/1500 を返す（行は作らない） */
export async function loadView(db: D1Database, uid: string): Promise<RatingView> {
  const player = await loadPlayer(db, uid);
  return ratingView(player.rating, player.bestRank);
}

async function countPairGames(db: D1Database, key: string, day: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM rated_game WHERE pair_key = ?1 AND played_on = ?2")
    .bind(key, day)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** 同じ相手とその日に何局目になるか（これから指す1局を含む） */
export async function pairGameNumber(
  db: D1Database,
  uidA: string,
  uidB: string,
  nowMs: number,
): Promise<number> {
  return (await countPairGames(db, pairKey(uidA, uidB), jstDateKey(nowMs))) + 1;
}

export async function botGamesToday(db: D1Database, uid: string, nowMs: number): Promise<number> {
  return countPairGames(db, botPairKey(uid), jstDateKey(nowMs));
}

/**
 * SQL that is true while `snapshot` is still current: the row is still absent,
 * or its game count (the version) is unchanged. Returns [sql, binds].
 */
function guard(snapshot: Snapshot): [string, unknown[]] {
  return snapshot.games === null
    ? ["NOT EXISTS (SELECT 1 FROM player_rating WHERE uid = ?)", [snapshot.uid]]
    : ["EXISTS (SELECT 1 FROM player_rating WHERE uid = ? AND wins + losses + draws = ?)", [snapshot.uid, snapshot.games]];
}

/**
 * The rated_game row, inserted only if every snapshot is current and the
 * pair's game count for the day is still `priorGames` (so the daily COM cap
 * and the streak scale hold). A replayed game_key with current snapshots
 * still fails on the primary key and aborts the batch.
 */
function insertGameIf(
  db: D1Database,
  game: { gameKey: string; pairKey: string; day: string; nowMs: number; priorGames: number },
  snapshots: Snapshot[],
) {
  const guards = snapshots.map(guard);
  return db
    .prepare(
      `INSERT INTO rated_game (game_key, played_on, pair_key, created_at)
       SELECT ?, ?, ?, ?
       WHERE ${guards.map(([sql]) => sql).join(" AND ")}
         AND (SELECT COUNT(*) FROM rated_game WHERE pair_key = ? AND played_on = ?) = ?`,
    )
    .bind(
      game.gameKey,
      game.day,
      game.pairKey,
      game.nowMs,
      ...guards.flatMap(([, binds]) => binds),
      game.pairKey,
      game.day,
      game.priorGames,
    );
}

/**
 * The player's new rating, applied only if this batch's rated_game row went in
 * (same key and timestamp) and the player's snapshot is still current. Both
 * checks: the row proves the insert happened in this batch; the guard proves
 * nothing else moved this player since the snapshot.
 */
function upsertIf(
  db: D1Database,
  snapshot: Snapshot,
  outcome: RatingOutcome,
  score: Score,
  game: { gameKey: string; nowMs: number },
) {
  const [guardSql, guardBinds] = guard(snapshot);
  return db
    .prepare(
      `INSERT INTO player_rating (uid, rating, best_rank, wins, losses, draws, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ?
       WHERE ${guardSql}
         AND EXISTS (SELECT 1 FROM rated_game WHERE game_key = ? AND created_at = ?)
       ON CONFLICT(uid) DO UPDATE SET
         rating = excluded.rating, best_rank = excluded.best_rank,
         wins = wins + excluded.wins, losses = losses + excluded.losses, draws = draws + excluded.draws,
         updated_at = excluded.updated_at`,
    )
    .bind(
      snapshot.uid,
      outcome.rating,
      outcome.bestRank,
      score === 1 ? 1 : 0,
      score === 0 ? 1 : 0,
      score === 0.5 ? 1 : 0,
      game.nowMs,
      ...guardBinds,
      game.gameKey,
      game.nowMs,
    );
}

/** Lost races before giving up (each one means another result for the same player just landed). */
const MAX_ATTEMPTS = 5;

/** 判定に要るのは当日ぶんだけ。ごくたまに古い行を落として表を小さく保つ */
const PRUNE_PROBABILITY = 0.02;
const PRUNE_KEEP_DAYS = 3;

function pruneStatement(db: D1Database, nowMs: number) {
  const cutoff = jstDateKey(nowMs - PRUNE_KEEP_DAYS * 24 * 3600 * 1000);
  return db.prepare("DELETE FROM rated_game WHERE played_on < ?1").bind(cutoff);
}

function withPrune(db: D1Database, statements: D1PreparedStatement[], nowMs: number) {
  if (Math.random() >= PRUNE_PROBABILITY) return statements;
  // 掃除はバッチの末尾に足す。先頭に置くと、二重適用で巻き戻すたびに掃除も巻き戻る
  return [...statements, pruneStatement(db, nowMs)];
}

export type MatchRatingResult = {
  sente: RatingOutcome;
  gote: RatingOutcome;
};

/**
 * 対人戦（だれかと対戦）1局ぶんの反映。
 * 既に同じ room_code で反映済みなら null を返す（二重適用なし）。
 */
export async function applyMatchRating(
  db: D1Database,
  params: {
    roomCode: string;
    senteUid: string;
    goteUid: string;
    /** 先手から見た結果 */
    senteScore: Score;
    nowMs: number;
  },
): Promise<MatchRatingResult | null> {
  const { roomCode, senteUid, goteUid, senteScore, nowMs } = params;
  if (!senteUid || !goteUid || senteUid === goteUid) return null;

  const day = jstDateKey(nowMs);
  const key = pairKey(senteUid, goteUid);
  const goteScore = (1 - senteScore) as Score;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const [snapshots, priorGames] = await Promise.all([
      loadSnapshots(db, [senteUid, goteUid]),
      countPairGames(db, key, day),
    ]);
    const sente = snapshots.get(senteUid)!;
    const gote = snapshots.get(goteUid)!;
    const scale = streakScale(priorGames + 1);

    const senteOut = applyGame({
      rating: sente.rating,
      bestRank: sente.bestRank,
      opponentRating: gote.rating,
      score: senteScore,
      scales: [scale],
    });
    const goteOut = applyGame({
      rating: gote.rating,
      bestRank: gote.bestRank,
      opponentRating: sente.rating,
      score: goteScore,
      scales: [scale],
    });

    const game = { gameKey: roomCode, pairKey: key, day, nowMs, priorGames };
    const results = await db.batch(
      withPrune(
        db,
        [
          insertGameIf(db, game, [sente, gote]),
          upsertIf(db, sente, senteOut, senteScore, game),
          upsertIf(db, gote, goteOut, goteScore, game),
        ],
        nowMs,
      ),
    );
    if (results[0].meta.changes === 1) return { sente: senteOut, gote: goteOut };
    // Another result for one of the two landed after the snapshot: read again.
  }
  throw new Error("rating_contention");
}

/** Why a COM result moved nothing (checked again inside the write, not only up front). */
export type BotRatingResult =
  | { status: "applied"; outcome: RatingOutcome }
  | { status: "daily_limit" }
  | { status: "frozen" };

/**
 * COM戦1局ぶんの反映。呼ぶ前に「棋譜が本物か」を確かめておくこと。
 * 券（jti）を game_key に使うので、同じ券で2回目を撃つとバッチごと失敗する。
 * 1日の上限と「1級まで」は、書き込みと同じスナップショットでもう一度確かめる
 * （別の券が同時に届いても上限を越えない）。
 */
export async function applyBotRating(
  db: D1Database,
  params: {
    ticketId: string;
    uid: string;
    score: Score;
    comRating: number;
    nowMs: number;
    /** Default BOT_DAILY_LIMIT / BOT_RATED_MAX_RANK. */
    dailyLimit?: number;
    maxRank?: number;
  },
): Promise<BotRatingResult> {
  const { ticketId, uid, score, comRating, nowMs } = params;
  const dailyLimit = params.dailyLimit ?? BOT_DAILY_LIMIT;
  const maxRank = params.maxRank ?? BOT_RATED_MAX_RANK;
  const day = jstDateKey(nowMs);
  const key = botPairKey(uid);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const [snapshots, priorGames] = await Promise.all([loadSnapshots(db, [uid]), countPairGames(db, key, day)]);
    const player = snapshots.get(uid)!;
    if (visibleRank(player.rating, player.bestRank) > maxRank) return { status: "frozen" };
    if (priorGames >= dailyLimit) return { status: "daily_limit" };
    const outcome = applyGame({
      rating: player.rating,
      bestRank: player.bestRank,
      opponentRating: comRating,
      score,
      scales: [BOT_SCALE],
    });
    const game = { gameKey: ticketId, pairKey: key, day, nowMs, priorGames };
    const results = await db.batch(
      withPrune(db, [insertGameIf(db, game, [player]), upsertIf(db, player, outcome, score, game)], nowMs),
    );
    if (results[0].meta.changes === 1) return { status: "applied", outcome };
  }
  throw new Error("rating_contention");
}
