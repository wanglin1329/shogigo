// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest'

import { jstDate, secondsUntilJstMidnight } from '../../src/site/jst'

describe('JST day boundary', () => {
  // 2026-09-30T14:59:59Z is 23:59:59 JST on 09-30; one second later it is 10-01.
  const lastSecond = Date.parse('2026-09-30T14:59:59Z')

  it('switches the date at JST midnight, not UTC midnight', () => {
    expect(jstDate(lastSecond)).toBe('2026-09-30')
    expect(jstDate(lastSecond + 1000)).toBe('2026-10-01')
    expect(jstDate(Date.parse('2026-09-30T23:30:00Z'))).toBe('2026-10-01')
  })

  it('caches until exactly the next JST midnight', () => {
    expect(secondsUntilJstMidnight(lastSecond)).toBe(1)
    expect(secondsUntilJstMidnight(lastSecond + 1000)).toBe(24 * 60 * 60)
    expect(secondsUntilJstMidnight(lastSecond - 999)).toBe(2)
  })
})
