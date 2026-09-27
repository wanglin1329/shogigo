// SPDX-License-Identifier: GPL-3.0-only

// A game as data: where it started, the moves played, and which of them is on
// the board. Undo/redo only move the cursor; playing from an earlier position
// cuts off the moves after it (docs/PLAN.md §5.3-11). Pure — no React.

import { applyMove, getOpponent, toUsiMoveString } from './engine'
import type { ApplyResult, GameState, Move, Player } from './engine'
import { parseUsiMove } from './kifu/moves'
import { createGameState } from './kifu/sfen'

export type ResultReason = NonNullable<ApplyResult['resultReason']> | 'resign'

export interface Outcome {
  winner: Player | 'draw'
  reason: ResultReason
  /** Number of moves on the board when the game ended. */
  plies: number
}

export interface GameRecord {
  /** Start position; null = 平手. */
  initialSfen: string | null
  /** USI moves from the start position. */
  moves: string[]
}

export interface GameView {
  record: GameRecord
  /** Moves currently on the board (0 … moves.length). */
  cursor: number
  /** states[i] is the position after i moves; length = moves.length + 1. */
  states: GameState[]
  /** Game end reached by the moves (checkmate / sennichite) or by resignation. */
  outcome: Outcome | null
}

function outcomeOf(result: ApplyResult, plies: number): Outcome | null {
  if (!result.gameOver || !result.winner || !result.resultReason) return null
  return { winner: result.winner, reason: result.resultReason, plies }
}

/** Builds the view for a record. Stops at the first illegal move (and drops the rest). */
export function openRecord(record: GameRecord, cursor = record.moves.length): GameView {
  let state = createGameState(record.initialSfen)
  const states = [state]
  const accepted: string[] = []
  let outcome: Outcome | null = null
  for (const usi of record.moves) {
    if (outcome) break
    const move = parseUsiMove(usi)
    if (!move) break
    let result: ApplyResult
    try {
      result = applyMove(state, move)
    } catch {
      break
    }
    state = result.state
    states.push(state)
    accepted.push(usi)
    outcome = outcomeOf(result, accepted.length)
  }
  return {
    record: { initialSfen: record.initialSfen, moves: accepted },
    cursor: Math.max(0, Math.min(cursor, accepted.length)),
    states,
    outcome,
  }
}

export function currentState(view: GameView): GameState {
  return view.states[view.cursor]
}

/** Whether the board shows the latest position (moves may only be added there or by branching). */
export function atEnd(view: GameView): boolean {
  return view.cursor === view.record.moves.length
}

/**
 * Plays `move` on the displayed position. If the cursor is not at the end, the
 * later moves are discarded first. Throws when the move is illegal.
 */
export function play(view: GameView, move: Move): GameView {
  const base = currentState(view)
  const result = applyMove(base, move)
  const usi = toUsiMoveString(move)
  const moves = [...view.record.moves.slice(0, view.cursor), usi]
  return {
    record: { initialSfen: view.record.initialSfen, moves },
    cursor: moves.length,
    states: [...view.states.slice(0, view.cursor + 1), result.state],
    outcome: outcomeOf(result, moves.length),
  }
}

/** Moves the cursor; an outcome stays attached only when its final position is shown. */
export function seek(view: GameView, cursor: number): GameView {
  const next = Math.max(0, Math.min(cursor, view.record.moves.length))
  return { ...view, cursor: next }
}

/** Ends the game by resignation of `loser` at the displayed position. */
export function resign(view: GameView, loser: Player): GameView {
  return {
    record: { initialSfen: view.record.initialSfen, moves: view.record.moves.slice(0, view.cursor) },
    cursor: view.cursor,
    states: view.states.slice(0, view.cursor + 1),
    outcome: { winner: getOpponent(loser), reason: 'resign', plies: view.cursor },
  }
}

/** The outcome if the displayed position is where the game ended. */
export function visibleOutcome(view: GameView): Outcome | null {
  return view.outcome && view.cursor === view.outcome.plies ? view.outcome : null
}
