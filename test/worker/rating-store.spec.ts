// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2025~ Yuki Lab
// Copyright 2026 the shogi project contributors
// Modified 2026-09-27: import paths for this repository.
// Modified 2026-09-27: applyBotRating returns a status; concurrency tests for
//   the compare-and-swap writes.

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { INTERNAL_START, RANKS, rankOf, START_RANK } from "../../src/online/rating";
import {
  applyBotRating,
  applyMatchRating,
  botGamesToday,
  loadPlayer,
  loadView,
  pairGameNumber,
} from "../../src/games/shogi/server/rating-store";

const NOW = Date.parse("2026-08-25T03:00:00Z"); // 2026-08-25 12:00 JST
const A = "aaaaaaaa-1111-4111-8111-111111111111";
const B = "bbbbbbbb-2222-4222-8222-222222222222";

beforeEach(async () => {
  await env.DB.exec("DELETE FROM rated_game");
  await env.DB.exec("DELETE FROM player_rating");
});

describe("loadPlayer", () => {
  it("hands back the 5級 default without creating a row", async () => {
    const player = await loadPlayer(env.DB, A);
    expect(player.rating).toBe(INTERNAL_START);
    expect(player.bestRank).toBe(START_RANK);
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM player_rating").first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it("builds the lobby view for a brand-new player", async () => {
    const view = await loadView(env.DB, A);
    expect(view.rating).toBe(1500);
    expect(view.rankLabel).toBe("5級");
    expect(view.nextLabel).toBe("4級");
    expect(view.pointsToNext).toBe(100);
  });
});

describe("applyMatchRating", () => {
  it("moves both players in opposite directions", async () => {
    const out = await applyMatchRating(env.DB, {
      roomCode: "ROOM000001",
      senteUid: A,
      goteUid: B,
      senteScore: 1,
      nowMs: NOW,
    });
    expect(out).not.toBeNull();
    expect(out!.sente.displayDelta).toBe(37);
    expect(out!.gote.displayDelta).toBe(-7); // 負けは抑えが効く（抑えなしなら −22）
    expect((await loadPlayer(env.DB, A)).rating).toBe(1016);
    expect((await loadPlayer(env.DB, B)).rating).toBe(995);
  });

  it("refuses to apply the same room twice (batch rolls back on the PK clash)", async () => {
    const first = await applyMatchRating(env.DB, {
      roomCode: "ROOM000002",
      senteUid: A,
      goteUid: B,
      senteScore: 1,
      nowMs: NOW,
    });
    expect(first).not.toBeNull();
    const ratingAfterFirst = (await loadPlayer(env.DB, A)).rating;

    await expect(
      applyMatchRating(env.DB, {
        roomCode: "ROOM000002",
        senteUid: A,
        goteUid: B,
        senteScore: 1,
        nowMs: NOW,
      }),
    ).rejects.toThrow();

    // 1点も動いていないこと
    expect((await loadPlayer(env.DB, A)).rating).toBe(ratingAfterFirst);
    const games = await env.DB.prepare("SELECT COUNT(*) AS n FROM rated_game").first<{ n: number }>();
    expect(games?.n).toBe(1);
  });

  it("decays the 3rd, 4th and later games against the same opponent", async () => {
    const deltas: number[] = [];
    for (let i = 1; i <= 6; i++) {
      const out = await applyMatchRating(env.DB, {
        roomCode: `ROOM00000${i}`,
        senteUid: A,
        goteUid: B,
        senteScore: 1,
        nowMs: NOW,
      });
      deltas.push(out!.sente.rating);
    }
    // 内部レートの増分で見る（実力値は倍率がかかるため）
    const steps = deltas.map((rating, i) => rating - (i === 0 ? INTERNAL_START : deltas[i - 1]));
    expect(steps[0]).toBe(16); // 1局目 そのまま
    expect(steps[1]).toBeGreaterThan(8); // 2局目 そのまま
    expect(steps[2]).toBeLessThan(steps[1]); // 3局目 半分
    expect(steps[4]).toBe(1); // 5局目以降 最小値
    expect(steps[5]).toBe(1);
  });

  it("counts the streak per day and per pair", async () => {
    expect(await pairGameNumber(env.DB, A, B, NOW)).toBe(1);
    await applyMatchRating(env.DB, {
      roomCode: "ROOM000010",
      senteUid: A,
      goteUid: B,
      senteScore: 1,
      nowMs: NOW,
    });
    expect(await pairGameNumber(env.DB, A, B, NOW)).toBe(2);
    // 相手が変われば数え直し
    expect(await pairGameNumber(env.DB, A, "cccccccc-3333-4333-8333-333333333333", NOW)).toBe(1);
    // 翌日も数え直し
    expect(await pairGameNumber(env.DB, A, B, NOW + 24 * 3600 * 1000)).toBe(1);
  });

  it("skips games with a missing or self-matched uid", async () => {
    expect(
      await applyMatchRating(env.DB, {
        roomCode: "ROOM000020",
        senteUid: A,
        goteUid: "",
        senteScore: 1,
        nowMs: NOW,
      }),
    ).toBeNull();
    expect(
      await applyMatchRating(env.DB, {
        roomCode: "ROOM000021",
        senteUid: A,
        goteUid: A,
        senteScore: 1,
        nowMs: NOW,
      }),
    ).toBeNull();
  });

  it("records a draw for both sides", async () => {
    await applyMatchRating(env.DB, {
      roomCode: "ROOM000030",
      senteUid: A,
      goteUid: B,
      senteScore: 0.5,
      nowMs: NOW,
    });
    const row = await env.DB
      .prepare("SELECT wins, losses, draws FROM player_rating WHERE uid = ?1")
      .bind(A)
      .first<{ wins: number; losses: number; draws: number }>();
    expect(row).toEqual({ wins: 0, losses: 0, draws: 1 });
  });
});

describe("applyBotRating", () => {
  it("moves half as much as a human game", async () => {
    const out = await applyBotRating(env.DB, {
      ticketId: "ticket-1",
      uid: A,
      score: 1,
      comRating: INTERNAL_START,
      nowMs: NOW,
    });
    expect(out.status === "applied" && out.outcome.rating - INTERNAL_START).toBe(8);
  });

  it("cannot be replayed with the same ticket", async () => {
    await applyBotRating(env.DB, {
      ticketId: "ticket-2",
      uid: A,
      score: 1,
      comRating: INTERNAL_START,
      nowMs: NOW,
    });
    const after = (await loadPlayer(env.DB, A)).rating;
    await expect(
      applyBotRating(env.DB, {
        ticketId: "ticket-2",
        uid: A,
        score: 1,
        comRating: INTERNAL_START,
        nowMs: NOW,
      }),
    ).rejects.toThrow();
    expect((await loadPlayer(env.DB, A)).rating).toBe(after);
  });

  it("counts COM games per day for the daily cap", async () => {
    expect(await botGamesToday(env.DB, A, NOW)).toBe(0);
    await applyBotRating(env.DB, {
      ticketId: "ticket-3",
      uid: A,
      score: 0,
      comRating: INTERNAL_START,
      nowMs: NOW,
    });
    expect(await botGamesToday(env.DB, A, NOW)).toBe(1);
    expect(await botGamesToday(env.DB, A, NOW + 24 * 3600 * 1000)).toBe(0);
  });

  it("keeps the best rank when a COM loss drags the rating down", async () => {
    const peak = rankOf(2000);
    await env.DB
      .prepare(
        "INSERT INTO player_rating (uid, rating, best_rank, updated_at) VALUES (?1, ?2, ?3, ?4)",
      )
      .bind(A, 1218, peak, NOW)
      .run();
    const out = await applyBotRating(env.DB, {
      ticketId: "ticket-4",
      uid: A,
      score: 0,
      comRating: 1218,
      nowMs: NOW,
    });
    // 初段 is above the COM ceiling: allow it here to check the best rank is kept.
    expect(out.status).toBe("frozen");
    const allowed = await applyBotRating(env.DB, {
      ticketId: "ticket-5",
      uid: A,
      score: 0,
      comRating: 1218,
      nowMs: NOW,
      maxRank: RANKS.length - 1,
    });
    if (allowed.status !== "applied") throw new Error(allowed.status);
    expect(allowed.outcome.bestRank).toBe(peak);
    expect(RANKS[allowed.outcome.bestRank].label).toBe("初段");
    expect(allowed.outcome.displayDelta).toBeLessThan(0);
  });
});

describe("concurrent results for the same player", () => {
  it("applies two COM results landing together one after the other (no lost update)", async () => {
    const [x, y] = await Promise.all([
      applyBotRating(env.DB, { ticketId: "c-1", uid: A, score: 1, comRating: INTERNAL_START, nowMs: NOW }),
      applyBotRating(env.DB, { ticketId: "c-2", uid: A, score: 1, comRating: INTERNAL_START, nowMs: NOW }),
    ]);
    expect(x.status).toBe("applied");
    expect(y.status).toBe("applied");
    const row = await env.DB
      .prepare("SELECT rating, wins FROM player_rating WHERE uid = ?1")
      .bind(A)
      .first<{ rating: number; wins: number }>();
    expect(row?.wins).toBe(2);
    // Same as applying them in sequence: +8 then a little less.
    const sequential = [x, y].map((r) => (r.status === "applied" ? r.outcome.rating : 0)).sort((a, b) => a - b)
    expect(row?.rating).toBe(sequential[1]);
    expect(sequential[1]).toBeGreaterThan(sequential[0]);
  });

  it("never lets simultaneous tickets pass the daily cap", async () => {
    const results = await Promise.all(
      [1, 2, 3].map((i) =>
        applyBotRating(env.DB, { ticketId: `cap-${i}`, uid: A, score: 0, comRating: INTERNAL_START, nowMs: NOW, dailyLimit: 2 }),
      ),
    );
    expect(results.filter((r) => r.status === "applied")).toHaveLength(2);
    expect(results.filter((r) => r.status === "daily_limit")).toHaveLength(1);
    expect(await botGamesToday(env.DB, A, NOW)).toBe(2);
  });

  it("keeps a human game and a COM result for the same player both", async () => {
    await Promise.all([
      applyMatchRating(env.DB, { roomCode: "ROOM-CC-1", senteUid: A, goteUid: B, senteScore: 1, nowMs: NOW }),
      applyBotRating(env.DB, { ticketId: "c-3", uid: A, score: 1, comRating: INTERNAL_START, nowMs: NOW }),
    ]);
    const row = await env.DB
      .prepare("SELECT wins, losses FROM player_rating WHERE uid = ?1")
      .bind(A)
      .first<{ wins: number; losses: number }>();
    expect(row).toEqual({ wins: 2, losses: 0 });
    const games = await env.DB.prepare("SELECT COUNT(*) AS n FROM rated_game").first<{ n: number }>();
    expect(games?.n).toBe(2);
  });

  it("still rejects a replayed ticket racing with its original", async () => {
    const results = await Promise.allSettled([
      applyBotRating(env.DB, { ticketId: "dup", uid: A, score: 1, comRating: INTERNAL_START, nowMs: NOW }),
      applyBotRating(env.DB, { ticketId: "dup", uid: A, score: 1, comRating: INTERNAL_START, nowMs: NOW }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const row = await env.DB.prepare("SELECT wins FROM player_rating WHERE uid = ?1").bind(A).first<{ wins: number }>();
    expect(row?.wins).toBe(1);
  });
});
