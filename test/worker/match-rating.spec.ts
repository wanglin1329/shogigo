// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2025~ Yuki Lab
// Copyright 2026 the shogi project contributors
// Modified 2026-09-27: import paths for this repository.
// Modified 2026-09-27: a hidden rank no longer leaks to the opponent after the
//   game (payloads are per viewer); tests for HTTP, reconnect and WebSocket.

// 「だれかと対戦」の終局で実力値が動くこと。終局の書き込みは詰み・投了・時間切れ・
// 切断負けの4か所に分かれているが、実力値を動かすのは finalizeGameOver の1か所だけ。
// ここではその1か所が「必ず1回だけ」通ることを確かめる。

import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { signPlayerToken } from "../../src/online/token";
import { beforeEach, describe, expect, it } from "vitest";
import type { MatchRoom } from "../../src/games/shogi/server/match-room";
import { RANKS, START_RANK } from "../../src/online/rating";
import { loadPlayer } from "../../src/games/shogi/server/rating-store";

const UID_A = "aaaaaaaa-1111-4111-8111-111111111111";
const UID_B = "bbbbbbbb-2222-4222-8222-222222222222";

let roomSeq = 0;
function nextCode() {
  roomSeq += 1;
  return `RATE${String(roomSeq).padStart(6, "2")}`;
}

async function setUpRoom(
  matchType: "matchmaking" | "invite",
  ranks: { a?: number | null; b?: number | null } = {},
) {
  const code = nextCode();
  const stub = env.MATCH_ROOM.getByName(code);
  const created = await stub.createRoom({
    roomCode: code,
    uid: UID_A,
    displayName: null,
    sidePref: "sente",
    tcType: "per_move",
    tcSeconds: 30,
    matchType,
    bestRank: ranks.a === undefined ? START_RANK : ranks.a,
  });
  if (!created.ok) throw new Error("createRoom failed");
  const joined = await stub.join({
    uid: UID_B,
    displayName: null,
    bestRank: ranks.b === undefined ? START_RANK : ranks.b,
  });
  if (!joined.ok) throw new Error("join failed");
  // sidePref "sente" なので A=先手 / B=後手 で固定
  return { code, stub };
}

beforeEach(async () => {
  await env.DB.exec("DELETE FROM rated_game");
  await env.DB.exec("DELETE FROM player_rating");
});

describe("終局で実力値が動く", () => {
  it("moves both players and reports the delta on the payload (投了)", async () => {
    const { stub } = await setUpRoom("matchmaking");
    const result = await stub.resign({ side: "sente", uid: UID_A, expectedRevision: null });
    expect(result.ok).toBe(true);
    const match = result.ok ? result.match : null;

    // 先手が投了 = 後手の勝ち
    expect(match!.gote_rating_delta).toBe(37);
    expect(match!.sente_rating_delta).toBe(-7); // 負けは抑えが効く（抑えなしなら −22）
    expect(match!.gote_rating).toBe(1537);
    expect(match!.sente_rating).toBe(1493);
    expect((await loadPlayer(env.DB, UID_B)).rating).toBe(1016);
    expect((await loadPlayer(env.DB, UID_A)).rating).toBe(995);
  });

  it("leaves 友達対戦 alone", async () => {
    const { stub } = await setUpRoom("invite");
    const result = await stub.resign({ side: "sente", uid: UID_A, expectedRevision: null });
    const match = result.ok ? result.match : null;
    expect(match!.sente_rating_delta).toBeNull();
    expect(match!.gote_rating_delta).toBeNull();
    expect(match!.sente_rank_visible).toBe(false);
    expect(match!.gote_rank_visible).toBe(false);
    const rows = await env.DB.prepare("SELECT COUNT(*) AS n FROM player_rating").first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });

  it("carries the badge ranks from the moment both players sat down", async () => {
    const shodan = RANKS.findIndex((r) => r.label === "初段");
    const { stub } = await setUpRoom("matchmaking", { a: START_RANK, b: shodan });
    const state = await stub.getStateFor({ side: "sente", uid: UID_A });
    const match = state.ok ? state.match : null;
    expect(match!.sente_rank).toBe(START_RANK);
    expect(match!.gote_rank).toBe(shodan);
    expect(match!.sente_rank_visible).toBe(true);
    expect(match!.gote_rank_visible).toBe(true);
  });

  it("preserves a hidden opponent's visibility while keeping their own result card values", async () => {
    const { stub } = await setUpRoom("matchmaking", { a: null });
    const before = await stub.getStateFor({ side: "gote", uid: UID_B });
    expect(before.ok && before.match.sente_rank).toBeNull();
    expect(before.ok && before.match.sente_rank_visible).toBe(false);
    expect(before.ok && before.match.gote_rank_visible).toBe(true);

    const result = await stub.resign({ side: "sente", uid: UID_A, expectedRevision: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.match.sente_rank_visible).toBe(false);
    expect(result.match.gote_rank_visible).toBe(true);
    expect(result.match.sente_rank).not.toBeNull();
    expect(result.match.sente_rating).toBe(1493);
    expect(result.match.sente_rating_delta).toBe(-7);
    const reconnect = await stub.join({ uid: UID_A, displayName: null, bestRank: START_RANK });
    expect(reconnect.ok && reconnect.match.sente_rank_visible).toBe(false);
  });

  it("never sends a hidden player's rank or result to the opponent (HTTP and reconnect)", async () => {
    const { stub } = await setUpRoom("matchmaking", { a: null }); // A = 先手 hides
    await stub.resign({ side: "sente", uid: UID_A, expectedRevision: null });

    const opponentView = await stub.getStateFor({ side: "gote", uid: UID_B });
    if (!opponentView.ok) throw new Error("state failed");
    expect(opponentView.match.sente_rank).toBeNull();
    expect(opponentView.match.sente_rating).toBeNull();
    expect(opponentView.match.sente_rating_delta).toBeNull();
    expect(opponentView.match.sente_promoted).toBeNull();
    // …while B still gets their own result card.
    expect(opponentView.match.gote_rating).toBe(1537);
    expect(opponentView.match.gote_rating_delta).toBe(37);

    const rejoin = await stub.join({ uid: UID_B, displayName: null, bestRank: START_RANK });
    if (!rejoin.ok) throw new Error("rejoin failed");
    expect(rejoin.match.sente_rating).toBeNull();
    expect(rejoin.match.sente_rating_delta).toBeNull();
    expect(rejoin.match.gote_rating).toBe(1537);
  });

  it("hides the opponent's rank from the player who hid theirs too", async () => {
    const { stub } = await setUpRoom("matchmaking", { a: null }); // A hides, B shows
    const before = await stub.getStateFor({ side: "sente", uid: UID_A });
    expect(before.ok && before.match.gote_rank).toBeNull();
    const result = await stub.resign({ side: "sente", uid: UID_A, expectedRevision: null });
    if (!result.ok) throw new Error("resign failed");
    expect(result.match.gote_rating).toBeNull();
    expect(result.match.gote_rating_delta).toBeNull();
    expect(result.match.sente_rating).toBe(1493); // A's own card
  });

  it("redacts the WebSocket broadcast per recipient", async () => {
    const { code, stub } = await setUpRoom("matchmaking", { a: null });
    const token = await signPlayerToken(
      { roomCode: code, side: "gote", uid: UID_B, exp: Date.now() + 60_000 },
      "test-secret-for-vitest-only",
    );
    const res = await exports.default.fetch(
      new Request(`https://example.com/api/rooms/${code}/ws?token=${encodeURIComponent(token)}`, {
        headers: { Upgrade: "websocket" },
      }),
    );
    expect(res.status).toBe(101);
    const ws = res.webSocket!;
    const messages: Array<{ type: string; match?: Record<string, unknown> }> = [];
    ws.accept();
    ws.addEventListener("message", (e) => {
      if (typeof e.data === "string" && e.data !== "pong") messages.push(JSON.parse(e.data));
    });
    await stub.resign({ side: "sente", uid: UID_A, expectedRevision: null });
    for (let i = 0; i < 50 && !messages.some((m) => m.match?.game_over); i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    const final = messages.find((m) => m.match?.game_over)!.match!;
    expect(final.sente_rating).toBeNull();
    expect(final.sente_rating_delta).toBeNull();
    expect(final.gote_rating).toBe(1537);
    ws.close();
  });

  it("announces a promotion only on the game that crossed the line", async () => {
    // 4級の一歩手前まで持ち上げておく
    await env.DB
      .prepare("INSERT INTO player_rating (uid, rating, best_rank, updated_at) VALUES (?1,?2,?3,?4)")
      .bind(UID_B, 1043, START_RANK, Date.now())
      .run();
    const first = await setUpRoom("matchmaking");
    const won = await first.stub.resign({ side: "sente", uid: UID_A, expectedRevision: null });
    expect((won.ok ? won.match : null)!.gote_promoted).toBe("4級");

    const second = await setUpRoom("matchmaking");
    const again = await second.stub.resign({ side: "sente", uid: UID_A, expectedRevision: null });
    expect((again.ok ? again.match : null)!.gote_promoted).toBeNull();
  });
});

describe("二重に加算しない", () => {
  it("applies the rating exactly once no matter how often the timeout is re-checked", async () => {
    const { stub } = await setUpRoom("matchmaking");
    // 手番の締切を過去へ倒す。時間切れは alarm と、状態を読みに来た経路の両方が拾う
    await runInDurableObject(stub, async (_instance: MatchRoom, state) => {
      state.storage.sql.exec("UPDATE match SET turn_deadline = ? WHERE id = 1", Date.now() - 1000);
      await state.storage.setAlarm(Date.now());
    });
    await runDurableObjectAlarm(stub);
    const settled = await stub.getStateFor({ side: "sente", uid: UID_A });
    expect(settled.ok && settled.match.result_reason).toBe("timeout");
    expect(settled.ok && Number.isFinite(Date.parse(settled.match.ended_at!))).toBe(true);

    // 手番だった先手が負け、後手が勝つ
    const after = await loadPlayer(env.DB, UID_B);
    expect(after.rating).toBe(1016);
    expect((await loadPlayer(env.DB, UID_A)).rating).toBe(995);
    const games = await env.DB.prepare("SELECT COUNT(*) AS n FROM rated_game").first<{ n: number }>();
    expect(games?.n).toBe(1);

    // アラームをもう一度撃っても、状態を何度読み直しても、1点も動かない
    await runInDurableObject(stub, async (_i: MatchRoom, state) => {
      await state.storage.setAlarm(Date.now());
    });
    await runDurableObjectAlarm(stub);
    const repeated = await stub.getStateFor({ side: "sente", uid: UID_A });
    expect(repeated.ok && repeated.match.ended_at).toBe(settled.ok && settled.match.ended_at);
    await stub.getStateFor({ side: "gote", uid: UID_B });
    expect((await loadPlayer(env.DB, UID_B)).rating).toBe(after.rating);
    const games2 = await env.DB.prepare("SELECT COUNT(*) AS n FROM rated_game").first<{ n: number }>();
    expect(games2?.n).toBe(1);
  });
});

describe("実力値が付かなくても対局結果は必ず出る", () => {
  it("still ends the game when the rating write fails", async () => {
    const code = nextCode();
    // 同じ game_key を先に埋めておくと、実力値更新のバッチが必ず失敗する
    await env.DB
      .prepare("INSERT INTO rated_game (game_key, played_on, pair_key, created_at) VALUES (?1,?2,?3,?4)")
      .bind(code, "1970-01-01", "x|y", 0)
      .run();

    const stub = env.MATCH_ROOM.getByName(code);
    await stub.createRoom({
      roomCode: code,
      uid: UID_A,
      displayName: null,
      sidePref: "sente",
      tcType: "per_move",
      tcSeconds: 30,
      matchType: "matchmaking",
      bestRank: START_RANK,
    });
    await stub.join({ uid: UID_B, displayName: null, bestRank: START_RANK });

    const result = await stub.resign({ side: "sente", uid: UID_A, expectedRevision: null });
    expect(result.ok).toBe(true);
    const match = result.ok ? result.match : null;
    expect(match!.game_over).toBe(true);
    expect(match!.winner).toBe("gote");
    expect(match!.result_reason).toBe("resign");
    expect(Number.isFinite(Date.parse(match!.ended_at!))).toBe(true);
    // 変動は出ないが、勝敗はきちんと届く
    expect(match!.sente_rating_delta).toBeNull();
    const rows = await env.DB.prepare("SELECT COUNT(*) AS n FROM player_rating").first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });
});
