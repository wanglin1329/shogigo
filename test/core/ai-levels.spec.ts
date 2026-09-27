// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest'

import {
  AI_LEVELS,
  DEFAULT_AI_LEVEL,
  isLevelUnlocked,
  levelOptions,
  levelUnlockedByBeating,
  resolvePlayableLevel,
} from '../../src/games/shogi/ai/levels'
import type { AiLevelId } from '../../src/games/shogi/ai/types'

describe('AI levels', () => {
  it('has the 11 levels in order with the reference parameters', () => {
    expect(AI_LEVELS.map((l) => l.label)).toEqual([
      '入門', '初級', '中級', '上級', '超級', '達人級', '偉人級', '超越級', '伝説1', '伝説2', '伝説3',
    ])
    expect(AI_LEVELS.filter((l) => l.engine === 'js').map((l) => l.id)).toEqual([
      'novice', 'easy', 'medium', 'hard', 'super',
    ])
    expect(AI_LEVELS.filter((l) => l.engine === 'yaneuraou').map((l) => l.nodes)).toEqual([
      5_000, 10_000, 30_000, 90_000, 300_000, 1_000_000,
    ])
    expect(DEFAULT_AI_LEVEL).toBe('medium')
  })

  it('lists unlocked levels plus only the next locked one', () => {
    const fresh = levelOptions(new Set())
    expect(fresh).toHaveLength(9)
    expect(fresh.at(-1)).toMatchObject({ level: { id: 'legendary1' }, state: 'locked', hint: '超越級に勝利して解放' })
    expect(fresh.slice(0, 8).every((o) => o.state === 'available')).toBe(true)

    const beaten = new Set<AiLevelId>(['transcendent'])
    const next = levelOptions(beaten)
    expect(next).toHaveLength(10)
    expect(next[8]).toMatchObject({ level: { id: 'legendary1' }, state: 'available' })
    expect(next[9]).toMatchObject({ level: { id: 'legendary2' }, state: 'locked', hint: '伝説1に勝利して解放' })

    const all = levelOptions(new Set<AiLevelId>(['transcendent', 'legendary1', 'legendary2']))
    expect(all).toHaveLength(11)
    expect(all.every((o) => o.state === 'available')).toBe(true)
  })

  it('falls back to the default for unknown or locked stored levels', () => {
    expect(resolvePlayableLevel('legendary2', new Set())).toBe('medium')
    expect(resolvePlayableLevel('nonsense', new Set())).toBe('medium')
    expect(resolvePlayableLevel('hard', new Set())).toBe('hard')
    expect(isLevelUnlocked('legendary2', new Set(['legendary1']))).toBe(true)
  })

  it('knows which level a win unlocks', () => {
    expect(levelUnlockedByBeating('transcendent')?.id).toBe('legendary1')
    expect(levelUnlockedByBeating('medium')).toBeNull()
  })
})
