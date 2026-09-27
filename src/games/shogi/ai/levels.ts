// SPDX-License-Identifier: GPL-3.0-only

// The 11 AI levels (docs/PLAN.md §5.1). Engine files and per-level parameters
// are those of the reference site: 入門〜超級 run the JS ai-worker (depth and
// deliberate weaknesses live inside ai-worker.js, keyed by the level id);
// 達人級〜伝説3 run やねうら王 with a node budget.

import type { AiLevelId } from './types'

export type AiEngine = 'js' | 'yaneuraou'

export interface AiLevel {
  id: AiLevelId
  label: string
  engine: AiEngine
  /** `go nodes N` for やねうら王 levels. */
  nodes?: number
  /** Level that must be beaten to unlock this one. */
  unlockedBy?: AiLevelId
}

export const AI_LEVELS: readonly AiLevel[] = [
  { id: 'novice', label: '入門', engine: 'js' },
  { id: 'easy', label: '初級', engine: 'js' },
  { id: 'medium', label: '中級', engine: 'js' },
  { id: 'hard', label: '上級', engine: 'js' },
  { id: 'super', label: '超級', engine: 'js' },
  { id: 'master', label: '達人級', engine: 'yaneuraou', nodes: 5_000 },
  { id: 'great', label: '偉人級', engine: 'yaneuraou', nodes: 10_000 },
  { id: 'transcendent', label: '超越級', engine: 'yaneuraou', nodes: 30_000 },
  { id: 'legendary1', label: '伝説1', engine: 'yaneuraou', nodes: 90_000, unlockedBy: 'transcendent' },
  { id: 'legendary2', label: '伝説2', engine: 'yaneuraou', nodes: 300_000, unlockedBy: 'legendary1' },
  { id: 'legendary3', label: '伝説3', engine: 'yaneuraou', nodes: 1_000_000, unlockedBy: 'legendary2' },
]

export const DEFAULT_AI_LEVEL: AiLevelId = 'medium'

/** The JS level used when やねうら王 is unavailable or answers illegally. */
export const FALLBACK_AI_LEVEL: AiLevelId = 'super'

const BY_ID = new Map(AI_LEVELS.map((level) => [level.id, level]))

export function isAiLevelId(value: unknown): value is AiLevelId {
  return typeof value === 'string' && BY_ID.has(value as AiLevelId)
}

export function getAiLevel(id: AiLevelId): AiLevel {
  const level = BY_ID.get(id)
  if (!level) throw new Error(`unknown AI level: ${id}`)
  return level
}

/** Whether `id` can be played given the levels the player has beaten. */
export function isLevelUnlocked(id: AiLevelId, beaten: ReadonlySet<AiLevelId>): boolean {
  const { unlockedBy } = getAiLevel(id)
  return !unlockedBy || beaten.has(unlockedBy)
}

export type LevelOption =
  | { level: AiLevel; state: 'available' }
  /** Shown disabled with the hint 「〇〇に勝利して解放」. */
  | { level: AiLevel; state: 'locked'; hint: string }

/**
 * Levels to list in the picker: every unlocked level, plus only the *next*
 * locked one (disabled, with its unlock hint). Levels further down the chain
 * stay hidden.
 */
export function levelOptions(beaten: ReadonlySet<AiLevelId>): LevelOption[] {
  const options: LevelOption[] = []
  for (const level of AI_LEVELS) {
    if (isLevelUnlocked(level.id, beaten)) {
      options.push({ level, state: 'available' })
      continue
    }
    const unlocker = getAiLevel(level.unlockedBy!)
    options.push({ level, state: 'locked', hint: `${unlocker.label}に勝利して解放` })
    break
  }
  return options
}

/** A stored or requested level, falling back to the default when invalid or locked. */
export function resolvePlayableLevel(value: unknown, beaten: ReadonlySet<AiLevelId>): AiLevelId {
  return isAiLevelId(value) && isLevelUnlocked(value, beaten) ? value : DEFAULT_AI_LEVEL
}

/** The level that beating `id` unlocks, if any (for 「次のレベルへ」). */
export function levelUnlockedByBeating(id: AiLevelId): AiLevel | null {
  return AI_LEVELS.find((level) => level.unlockedBy === id) ?? null
}
