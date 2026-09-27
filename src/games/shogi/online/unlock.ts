// SPDX-License-Identifier: GPL-3.0-only

// Gate for random matching (docs/PLAN.md §6.3): a newcomer first wins one game
// against the AI, so the first opponent they meet is not a stranger waiting
// on someone who does not know how the pieces move. Client-side only — a
// guide, not a security measure. (The tutorial and tsume conditions of the
// plan arrive with P2 / P4.)

import { readJson, writeJson } from '../../../site/storage'

const AI_PROGRESS_KEY = 'shogi.ai.progress'
const PLAYED_KEY = 'online.played'

/** Unlocked after one AI win, or for anyone who has already finished an online game. */
export function isRandomMatchUnlocked(): boolean {
  const progress = readJson<{ wins?: unknown }>(AI_PROGRESS_KEY)
  if (typeof progress?.wins === 'number' && progress.wins >= 1) return true
  return readJson<boolean>(PLAYED_KEY) === true
}

/** Call when an online game (human or COM) ends, so returning players are never locked out. */
export function markOnlinePlayed(): void {
  writeJson(PLAYED_KEY, true)
}
