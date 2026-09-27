// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest'

import { createGameState } from '../../src/games/shogi/core/kifu/sfen'
import { materialBalance, nextTutorialLevel, tutorialPlay } from '../../src/games/shogi/core/tutorial'

describe('tutorial', () => {
  it('counts material on the board and in hand', () => {
    expect(materialBalance(createGameState(null), 'sente')).toBe(0)
    // 先手 has an extra rook in hand.
    expect(materialBalance(createGameState('4k4/9/9/9/9/9/9/9/4K4 b R 1'), 'sente')).toBe(1000)
    expect(materialBalance(createGameState('4k4/9/9/9/9/9/9/9/4K4 b R 1'), 'gote')).toBe(-1000)
  })

  it('goes easier as the player falls behind', () => {
    const at = (balance: number) => nextTutorialLevel(0, { balance, plies: 10, lastThinkMs: 0 })
    expect(at(0)).toBe(0)
    expect(at(-301)).toBe(1)
    expect(at(-801)).toBe(2)
  })

  it('never gets harder again', () => {
    expect(nextTutorialLevel(2, { balance: 5000, plies: 10, lastThinkMs: 0 })).toBe(2)
    expect(nextTutorialLevel(1, { balance: 0, plies: 10, lastThinkMs: 0 })).toBe(1)
  })

  it('eases off in long games and for slow thinkers', () => {
    expect(nextTutorialLevel(0, { balance: 0, plies: 60, lastThinkMs: 0 })).toBe(1)
    expect(nextTutorialLevel(0, { balance: 0, plies: 110, lastThinkMs: 0 })).toBe(2)
    expect(nextTutorialLevel(0, { balance: 0, plies: 10, lastThinkMs: 25_000 })).toBe(1)
  })

  it('maps levels to COM settings', () => {
    expect(tutorialPlay(0)).toEqual({ level: 'easy' })
    expect(tutorialPlay(1).weakness?.dropBlind).toBe(0.7)
    expect(tutorialPlay(2)).toEqual({ level: 'novice' })
  })
})
