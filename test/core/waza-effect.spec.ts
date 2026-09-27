// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2026 the shogi project contributors

import { describe, expect, it } from 'vitest'

import {
  FIRST_TIME_EXTRA_MS,
  firstInGame,
  isWazaFxLevel,
  noteWaza,
  planWazaEffect,
  sanitizeBook,
} from '../../src/games/shogi/core/waza/effect'
import type { WazaHit } from '../../src/games/shogi/core/waza/types'
import { WazaTracker } from '../../src/games/shogi/core/waza/tracker'
import { WAZA_NAMES } from '../../src/games/shogi/core/waza/names'
import { WAZA_COPY } from '../../src/games/shogi/ui/waza-copy'

const once = { firstInGame: true, firstEver: false }
const again = { firstInGame: false, firstEver: false }

describe('planWazaEffect', () => {
  it('loud: band for big and mid every time, never for small', () => {
    expect(planWazaEffect({ tier: 'big' }, 'loud', again)?.band).toBe(true)
    expect(planWazaEffect({ tier: 'mid' }, 'loud', again)?.band).toBe(true)
    expect(planWazaEffect({ tier: 'small' }, 'loud', once)?.band).toBe(false)
  })

  it('std: band only for big, only the first time in the game', () => {
    expect(planWazaEffect({ tier: 'big' }, 'std', once)?.band).toBe(true)
    expect(planWazaEffect({ tier: 'big' }, 'std', again)?.band).toBe(false)
    expect(planWazaEffect({ tier: 'mid' }, 'std', once)?.band).toBe(false)
  })

  it('calm: marks and card, never a band', () => {
    expect(planWazaEffect({ tier: 'big' }, 'calm', once)).toMatchObject({ band: false, marks: true, card: true })
  })

  it('off, and 頭金 (tier none), show nothing', () => {
    expect(planWazaEffect({ tier: 'big' }, 'off', once)).toBeNull()
    expect(planWazaEffect({ tier: 'none' }, 'loud', once)).toBeNull()
  })

  it('holds small 4 s, mid 5 s, big 6 s, and longer the first time ever', () => {
    expect(planWazaEffect({ tier: 'small' }, 'std', once)?.holdMs).toBe(4000)
    expect(planWazaEffect({ tier: 'mid' }, 'std', once)?.holdMs).toBe(5000)
    expect(planWazaEffect({ tier: 'big' }, 'std', once)?.holdMs).toBe(6000)
    expect(planWazaEffect({ tier: 'big' }, 'std', { firstInGame: true, firstEver: true })?.holdMs).toBe(6000 + FIRST_TIME_EXTRA_MS)
  })

  it('validates stored levels', () => {
    expect(isWazaFxLevel('calm')).toBe(true)
    expect(isWazaFxLevel('loudest')).toBe(false)
  })
})

describe('first-time book', () => {
  it('notes a waza once', () => {
    const first = noteWaza({}, 'tarefu', '2026-09-27')
    expect(first.firstEver).toBe(true)
    expect(first.book).toEqual({ tarefu: '2026-09-27' })
    const second = noteWaza(first.book, 'tarefu', '2026-09-28')
    expect(second.firstEver).toBe(false)
    expect(second.book.tarefu).toBe('2026-09-27')
  })

  it('drops malformed stored data', () => {
    expect(sanitizeBook(null)).toEqual({})
    expect(sanitizeBook({ tarefu: '2026-09-27', bogin: 3, x: 'yesterday' })).toEqual({ tarefu: '2026-09-27' })
  })
})

describe('firstInGame', () => {
  const hit = (id: WazaHit['id'], ply: number, player: 'sente' | 'gote' = 'sente'): WazaHit => ({
    kind: 'tesuji',
    id,
    tier: 'big',
    player,
    ply,
    squares: [],
  })
  it('is false when the same player made it earlier in the game', () => {
    const hits = [hit('oute_bisha', 11), hit('oute_bisha', 31), hit('oute_bisha', 21, 'gote')]
    expect(firstInGame(hits, hits[0])).toBe(true)
    expect(firstInGame(hits, hits[1])).toBe(false)
    expect(firstInGame(hits, hits[2])).toBe(true)
  })
})

describe('WazaTracker', () => {
  // 四間飛車: sente swings the rook to 6筋 (6h) early in the game.
  const SHIKEN = ['7g7f', '3c3d', '6g6f', '8c8d', '2h6h']

  it('finds a strategy and keeps extending incrementally', () => {
    const tracker = new WazaTracker()
    const partial = tracker.scan(null, SHIKEN.slice(0, 4))
    expect(partial.hits.some((h) => h.id === 'shiken_bisha')).toBe(false)
    const full = tracker.scan(null, SHIKEN)
    expect(full.byPly.get(5)?.id).toBe('shiken_bisha')
  })

  it('starts over for another start position', () => {
    const tracker = new WazaTracker()
    tracker.scan(null, SHIKEN)
    // Same moves from a position without the 2h rook: no 四間飛車 there.
    const other = tracker.scan('lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B7/LNSGKGSNL b - 1', ['7g7f', '3c3d'])
    expect(other.hits.some((h) => h.id === 'shiken_bisha')).toBe(false)
  })

  it('survives an unreadable start position', () => {
    expect(new WazaTracker().scan('not a sfen', ['7g7f']).hits).toEqual([])
  })
})

describe('copy', () => {
  it('has our own line for every detectable waza', () => {
    for (const id of Object.keys(WAZA_NAMES)) {
      const copy = WAZA_COPY[id as keyof typeof WAZA_COPY]
      expect(copy, id).toBeDefined()
      expect(copy.line.length).toBeGreaterThan(5)
      // Written for this site, not carried over from upstream.
      expect(copy.line).not.toBe(WAZA_NAMES[id as keyof typeof WAZA_NAMES].sub)
    }
  })
})
