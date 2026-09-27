// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2025~ Yuki Lab
// Copyright 2026 the shogi project contributors
// Modified 2026-09-27: the wire state is PublicGameState (no position/check/turn
// history arrays — the server keeps them; clients replay usiMoveHistory), and
// the matchmaker's "queued" message carries the server-computed `botAt`.
// Modified 2026-09-27: OnlineStats carries botFallbackSeconds on uid-less responses.

// Shared types for the online-match API (Worker routes / MatchRoom DO / client).
// The wire payload uses stable snake_case fields expected by the browser client.
// Player uids are never exposed because a uid doubles as the reconnect credential;
// clients receive joined-state booleans and a per-connection `yourSide` instead.

import type { GameState, Move, Player } from '../core/engine'

/**
 * What clients receive about the position. The DO keeps the full GameState
 * (sennichite detection needs the histories); broadcasting them made every
 * message grow with the game (docs/PLAN.md §6.5-1). Clients rebuild anything
 * else by replaying `usiMoveHistory` from the room's start position.
 */
export type PublicGameState = Omit<GameState, 'positionHistory' | 'checkHistory' | 'turnHistory'>

export function toPublicState(state: GameState): PublicGameState {
  const { positionHistory: _p, checkHistory: _c, turnHistory: _t, ...rest } = state
  return rest
}

export type Winner = 'sente' | 'gote' | 'draw' | null

// Friend-match time control. "total" = sudden death (切れ負け), "per_move" =
// a fixed allowance per move (1手ごと). Enforced server-side by the DO alarm.
export type TimeControlType = 'none' | 'total' | 'per_move'

// The creator's stored seat preference; "random" is preserved so the lobby UI
// can restore the selection after a reload (the resolved seat is `yourSide`).
export type SidePref = 'sente' | 'gote' | 'random'

// How the room came to exist: "invite" = friend match via invite URL,
// "matchmaking" = seats assigned by the Matchmaker DO.
export type MatchType = 'invite' | 'matchmaking'

export type MatchPayload = {
  room_code: string
  created_at: string // ISO
  started_at: string | null // ISO; both players seated
  ended_at: string | null // ISO; fixed when the game ends, never the reconnect time
  expires_at: string // ISO
  sente_joined: boolean
  gote_joined: boolean
  sente_name: string | null
  gote_name: string | null
  state: PublicGameState
  revision: number
  game_over: boolean
  winner: Winner
  result_reason: string | null
  disconnect_side: Player | null
  disconnect_deadline: string | null // ISO
  side_pref: SidePref | null
  match_type: MatchType
  tc_type: TimeControlType
  tc_seconds: number // 0 when tc_type === "none"
  sente_time_ms: number | null // remaining at turn start (total mode only)
  gote_time_ms: number | null
  turn_deadline: string | null // ISO; the mover's clock reads 0:00 here (the flag falls FLAG_GRACE_MS later)
  server_now: string // ISO; lets clients offset their clock skew
  // 実力値・段級位（match_type === "matchmaking" のときだけ入る。友達対戦では null）。
  // 段級位は入室時に引いた値で、対局中は動かない。実力値と変動幅は終局時に入る。
  sente_rank: number | null
  gote_rank: number | null
  sente_rank_visible: boolean
  gote_rank_visible: boolean
  sente_rating: number | null // 実力値（内部レートではない）
  gote_rating: number | null
  sente_rating_delta: number | null
  gote_rating_delta: number | null
  sente_promoted: string | null // 昇級・昇段したときだけラベルが入る
  gote_promoted: string | null
}

export type DisconnectInfo = {
  side: Player | null
  deadline: string | null // ISO
}

export type ApiError = { code: string; message: string }

// DO RPC results (also serialized into HTTP/WS responses).
export type RoomResult =
  | { ok: true; match: MatchPayload; yourSide: Player; disconnect: DisconnectInfo }
  | { ok: false; error: ApiError; match?: MatchPayload }

export type MoveResult = { ok: true; match: MatchPayload } | { ok: false; error: ApiError; match?: MatchPayload }

// Client -> server WebSocket messages.
export type ClientWsMessage =
  | { type: 'move'; reqId: number; expectedRevision: number; move: Move }
  | { type: 'resign'; reqId: number; expectedRevision: number }

// Matchmaker queue: server -> client messages (GET /api/match/ws). Clients
// send nothing on this socket ("ping" keepalives are auto-answered; cancelling
// is just closing it). After "matched" / "bot" the server closes the socket.
export type MatchmakerServerMessage =
  /**
   * `botAt`: when the server will offer a COM game (ISO, server clock), or null
   * when the seeker turned the fallback off. Re-sent on every (re)connection.
   * `server_now`: the server clock at send time, so the client can correct its
   * own clock's skew when counting down to botAt.
   */
  | { type: 'queued'; playing: number; botAt: string | null; server_now: string }
  | {
      type: 'matched'
      room_code: string
      token: string
      yourSide: Player
      opponentName: string | null
      opponentRank: number | null
    }
  // ticket = COM戦の結果を1回だけ申告できる署名つきの引換券。
  | { type: 'bot'; ticket: string | null }
  | { type: 'error'; error: ApiError }

// Server -> client WebSocket messages.
export type ServerWsMessage =
  | {
      type: 'state'
      match: MatchPayload
      disconnect: DisconnectInfo
      yourSide: Player
    }
  | ({ type: 'ack'; reqId: number } & MoveResult)
  | { type: 'expired' }
  | { type: 'error'; error: ApiError }

/** GET /api/online-stats (rating only when a valid uid was sent). */
export type { RatingView } from '../../../online/rating'
import type { RatingView } from '../../../online/rating'

export type OnlineStats = {
  playing: number
  rating?: RatingView
  /** Seconds before a random-match seeker is offered COM (uid-less responses only). */
  botFallbackSeconds?: number
}

/** POST /api/bot-result */
export type BotResultRequest = {
  ticket: string
  side: Player
  result: 'win' | 'lose' | 'draw'
  difficulty: string
  moves?: string[]
}

export type BotResultResponse =
  | {
      ok: true
      outcome: {
        rated: boolean
        rating: RatingView
        ratingDelta: number
        promotedTo: string | null
        /** Why the rating did not move (rated: false): 初段以上 / 1日の上限. */
        skipped: 'frozen' | 'daily_limit' | null
      }
    }
  | { ok: false; error: ApiError }
