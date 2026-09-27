// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2026 the shogi project contributors

// Keeps the waza scan of one game up to date move by move: the replay and the
// scan are both extended incrementally (upstream kept the same caches as
// kifuReplayCached / wazaScanCached in shogi.js).

import { replayUsiMoves } from '../kifu/replay'
import type { ReplayResult } from '../kifu/replay'
import { normalizeInitialSfen } from '../kifu/sfen'
import type { Player } from '../engine'
import { scanWaza, summarizeWaza } from './index'
import type { WazaScan, WazaSummaryEntry } from './index'

export class WazaTracker {
  private initialSfen: string | null | undefined = undefined
  private replay: ReplayResult | undefined
  private scanned: WazaScan | undefined

  /** The scan for this game. Reuses the previous work for a common prefix. */
  scan(initialSfen: string | null, moves: readonly string[]): WazaScan {
    let start: string | null
    try {
      start = normalizeInitialSfen(initialSfen)
    } catch {
      return scanWaza(moves, null)
    }
    if (start !== this.initialSfen) {
      // Another game: nothing can be reused.
      this.initialSfen = start
      this.replay = undefined
      this.scanned = undefined
    }
    const replay = replayUsiMoves(start, moves, this.replay)
    const scan = scanWaza(replay.usiMoves, replay, this.scanned)
    this.replay = replay
    this.scanned = scan
    return scan
  }
}

/** A finished game's waza by `owners`, scanned from scratch (for saving it). */
export function gameWaza(initialSfen: string | null, moves: readonly string[], owners: readonly Player[]): WazaSummaryEntry[] {
  return summarizeWaza(new WazaTracker().scan(initialSfen, moves), owners)
}
