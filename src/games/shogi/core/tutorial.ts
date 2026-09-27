// SPDX-License-Identifier: GPL-3.0-only

// The tutorial COM goes easier the worse the player is doing — and never
// harder again (a beginner should not be punished for a good stretch).
// Behaviour modelled on upstream's tutorial (docs/research/research-C-online.md
// §2.4); the code is our own.

import type { AiLevelId } from '../ai/types'
import { CAPTURED_ORDER } from './engine'
import type { GameState, PieceType, Player } from './engine'

export type TutorialLevel = 0 | 1 | 2

const VALUE: Record<PieceType, number> = {
  OU: 0,
  HI: 1000,
  KA: 800,
  KI: 550,
  GI: 500,
  KE: 350,
  KY: 300,
  FU: 100,
  '+HI': 1200,
  '+KA': 1000,
  '+GI': 550,
  '+KE': 550,
  '+KY': 550,
  '+FU': 550,
}

/** Board + hand material of `me` minus the opponent's. */
export function materialBalance(state: Pick<GameState, 'board' | 'capturedPieces'>, me: Player): number {
  let sum = 0
  for (const row of state.board) {
    for (const p of row) if (p) sum += p.owner === me ? VALUE[p.type] : -VALUE[p.type]
  }
  for (const t of CAPTURED_ORDER) {
    const mine = state.capturedPieces[me][t]
    const theirs = state.capturedPieces[me === 'sente' ? 'gote' : 'sente'][t]
    sum += (mine - theirs) * VALUE[t]
  }
  return sum
}

/**
 * The level for the COM's next move. Only ever steps down (0 → 1 → 2):
 * behind by more than 300 / 800 in material, a long game (60 / 110 plies),
 * or a player who needed more than 20 s for the last move.
 */
export function nextTutorialLevel(
  current: TutorialLevel,
  input: { balance: number; plies: number; lastThinkMs: number },
): TutorialLevel {
  let level: TutorialLevel = input.balance >= -300 ? 0 : input.balance >= -800 ? 1 : 2
  if (input.plies >= 110) level = 2
  else if (input.plies >= 60 && level < 1) level = 1
  if (input.lastThinkMs > 20_000 && level < 1) level = 1
  return Math.max(current, level) as TutorialLevel
}

/** What the COM plays at a tutorial level: a JS level plus mistake knobs. */
export function tutorialPlay(level: TutorialLevel): { level: AiLevelId; weakness?: Record<string, number> } {
  if (level === 0) return { level: 'easy' }
  if (level === 1) return { level: 'easy', weakness: { exchange: 0, safeMove: 0.35, safeDrop: 1, dropBlind: 0.7, farCapture: 1 } }
  return { level: 'novice' }
}
