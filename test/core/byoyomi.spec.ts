// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest'

import { announce } from '../../src/games/shogi/ui/byoyomi'

// No speech/audio in Node: announce() falls back to a silent beep attempt.
describe('byoyomi marks', () => {
  it('skips marks at or above the time the turn started with', () => {
    expect(announce(30, 30, 'full', true)).toBe(30)
    expect(announce(20, 30, 'full', true)).toBe(20)
  })

  it('says only the latest mark after a jump', () => {
    expect(announce(3, 25, 'full', true)).toBe(3)
  })

  it('speaks each mark once', () => {
    expect(announce(10, 10, 'soft', true)).toBe(10)
    expect(announce(9, 10, 'soft', true)).toBe(10)
  })

  it('soft mode only has 10 and the final five', () => {
    expect(announce(20, 30, 'soft', true)).toBe(30)
    expect(announce(10, 30, 'soft', true)).toBe(10)
  })

  it('off never speaks', () => {
    expect(announce(1, 30, 'off', true)).toBe(30)
  })
})
