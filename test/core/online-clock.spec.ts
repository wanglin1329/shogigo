// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest'

import {
  dangerThresholdMs,
  formatClock,
  readClock,
  skewFrom,
  warnThresholdMs,
} from '../../src/games/shogi/online/clock'
import { makeMatch } from './online-fakes'

const NOW = Date.parse('2026-09-27T10:00:00Z')
const at = (ms: number) => new Date(ms).toISOString()

describe('clock thresholds and format', () => {
  it('warns at half the allowance or 60 s; danger at 30 % or 6 s', () => {
    expect(warnThresholdMs(30_000)).toBe(15_000)
    expect(warnThresholdMs(600_000)).toBe(60_000)
    expect(dangerThresholdMs(10_000)).toBe(3_000)
    expect(dangerThresholdMs(60_000)).toBe(6_000)
  })

  it('formats m:ss rounding up', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(1)).toBe('0:01')
    expect(formatClock(59_001)).toBe('1:00')
    expect(formatClock(-500)).toBe('0:00')
  })

  it('measures skew from server_now', () => {
    expect(skewFrom(at(NOW + 1500), NOW)).toBe(1500)
    expect(skewFrom(null, NOW)).toBe(0)
    expect(skewFrom('garbage', NOW)).toBe(0)
  })
})

describe('readClock', () => {
  it('is null without a time control or before both players sit', () => {
    expect(readClock(makeMatch(), 0, NOW)).toBeNull()
    expect(readClock(makeMatch({ tc_type: 'per_move', tc_seconds: 30, gote_joined: false }), 0, NOW)).toBeNull()
  })

  it('per move: the mover counts down from the deadline, the other shows the full allowance', () => {
    const match = makeMatch({ tc_type: 'per_move', tc_seconds: 30, turn_deadline: at(NOW + 20_000) })
    const clock = readClock(match, 0, NOW)!
    expect(clock.active).toBe('sente')
    expect(clock.sente).toEqual({ ms: 20_000, running: true, level: 'normal' })
    expect(clock.gote).toEqual({ ms: 30_000, running: false, level: 'normal' })
  })

  it('caps the start buffer at the allowance and corrects the skew', () => {
    const match = makeMatch({ tc_type: 'per_move', tc_seconds: 30, turn_deadline: at(NOW + 35_000) })
    expect(readClock(match, 0, NOW)!.sente.ms).toBe(30_000)
    // Server is 2 s ahead of this device: 2 s less remain.
    const late = makeMatch({ tc_type: 'per_move', tc_seconds: 30, turn_deadline: at(NOW + 10_000) })
    expect(readClock(late, 2_000, NOW)!.sente.ms).toBe(8_000)
  })

  it('total: the mover reads the deadline capped by its bank, the other its bank', () => {
    const match = makeMatch(
      { tc_type: 'total', tc_seconds: 300, sente_time_ms: 200_000, gote_time_ms: 250_000, turn_deadline: at(NOW + 190_000) },
      ['7g7f'],
    )
    const clock = readClock(match, 0, NOW)!
    expect(clock.active).toBe('gote')
    expect(clock.gote.ms).toBe(190_000)
    expect(clock.sente).toEqual({ ms: 200_000, running: false, level: 'normal' })
  })

  it('flags warn and danger for the running side only', () => {
    const warn = readClock(makeMatch({ tc_type: 'per_move', tc_seconds: 30, turn_deadline: at(NOW + 12_000) }), 0, NOW)!
    expect(warn.sente.level).toBe('warn')
    const danger = readClock(makeMatch({ tc_type: 'per_move', tc_seconds: 30, turn_deadline: at(NOW + 5_000) }), 0, NOW)!
    expect(danger.sente.level).toBe('danger')
    expect(danger.gote.level).toBe('normal')
    const gone = readClock(makeMatch({ tc_type: 'per_move', tc_seconds: 30, turn_deadline: at(NOW - 500) }), 0, NOW)!
    expect(gone.sente.ms).toBe(0)
  })

  it('stops when the game is over', () => {
    const over = readClock(makeMatch({ tc_type: 'per_move', tc_seconds: 30, game_over: true, turn_deadline: null }), 0, NOW)!
    expect(over.active).toBeNull()
    expect(over.sente.running).toBe(false)
  })
})
