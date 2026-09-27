// SPDX-License-Identifier: GPL-3.0-only

// The server sends a slimmed state (no position/check/turn histories,
// docs/PLAN.md §6.5-1). The client rebuilds the full GameState by replaying
// `usiMoveHistory` — needed for legal moves, notation and optimistic moves —
// and checks the result against the server's board. The server stays the
// authority: on a mismatch its board is shown and the mismatch is reported.

import type { Board, CapturedPieces, GameState } from '../core/engine'
import { replayUsiMoves } from '../core/kifu/replay'
import type { ReplayResult } from '../core/kifu/replay'
import type { PublicGameState } from '../server/protocol'

export interface RebuiltPosition {
  state: GameState
  /** true when the replay disagrees with the server (or could not be replayed). */
  mismatch: boolean
  /** Pass back in for the next update: the common prefix is not replayed again. */
  replay: ReplayResult | null
}

function sameBoard(a: Board, b: Board): boolean {
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const p = a[y]?.[x] ?? null
      const q = b[y]?.[x] ?? null
      if (!p !== !q) return false
      if (p && q && (p.type !== q.type || p.owner !== q.owner)) return false
    }
  }
  return true
}

function sameHands(a: CapturedPieces, b: CapturedPieces): boolean {
  for (const side of ['sente', 'gote'] as const) {
    for (const key of ['HI', 'KA', 'KI', 'GI', 'KE', 'KY', 'FU'] as const) {
      if ((a[side]?.[key] ?? 0) !== (b[side]?.[key] ?? 0)) return false
    }
  }
  return true
}

/** The server's state as a GameState, with histories only as long as we know them. */
function fromServer(server: PublicGameState): GameState {
  return {
    ...server,
    positionHistory: [],
    checkHistory: [],
    turnHistory: [],
    usiMoveHistory: [...server.usiMoveHistory],
  }
}

/**
 * Online rooms always start from the standard position (initialSfen = null).
 */
export function rebuildPosition(server: PublicGameState, previous: ReplayResult | null = null): RebuiltPosition {
  let replay: ReplayResult
  try {
    replay = replayUsiMoves(null, server.usiMoveHistory, previous ?? undefined)
  } catch {
    return { state: fromServer(server), mismatch: true, replay: null }
  }
  if (
    !replay.ok ||
    replay.state.currentPlayer !== server.currentPlayer ||
    !sameBoard(replay.state.board, server.board) ||
    !sameHands(replay.state.capturedPieces, server.capturedPieces)
  ) {
    return { state: fromServer(server), mismatch: true, replay: null }
  }
  return { state: replay.state, mismatch: false, replay }
}
