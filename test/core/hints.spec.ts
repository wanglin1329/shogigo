// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest'

import {
  attackersOf,
  canPromote,
  checkingPieces,
  explainNoDrops,
  explainNoMoves,
  explainRejectedDrop,
  explainRejectedMove,
  legalDrops,
  legalTargets,
  movablePieces,
  mustPromote,
} from '../../src/games/shogi/core/hints'
import { createGameState } from '../../src/games/shogi/core/kifu/sfen'

const at = (x: number, y: number) => ({ x, y })
const UCHIFUZUME = '7nk/7p1/8G/9/9/9/9/9/4K4 b P 1'

describe('promotion', () => {
  it('allows promotion entering or leaving the enemy camp', () => {
    expect(canPromote({ type: 'FU', owner: 'sente' }, 3, 2)).toBe(true)
    expect(canPromote({ type: 'GI', owner: 'sente' }, 2, 3)).toBe(true)
    expect(canPromote({ type: 'GI', owner: 'sente' }, 4, 3)).toBe(false)
    expect(canPromote({ type: 'KI', owner: 'sente' }, 3, 2)).toBe(false)
    expect(canPromote({ type: 'FU', owner: 'gote' }, 5, 6)).toBe(true)
  })

  it('forces promotion where the piece could never move again', () => {
    expect(mustPromote({ type: 'FU', owner: 'sente' }, 0)).toBe(true)
    expect(mustPromote({ type: 'KY', owner: 'gote' }, 8)).toBe(true)
    expect(mustPromote({ type: 'KE', owner: 'sente' }, 1)).toBe(true)
    expect(mustPromote({ type: 'KE', owner: 'sente' }, 2)).toBe(false)
    expect(mustPromote({ type: 'GI', owner: 'sente' }, 0)).toBe(false)
  })
})

describe('legal moves', () => {
  it('lists the pieces with a legal move at the start', () => {
    const state = createGameState(null)
    // Knights and the bishop are blocked at the start; everything else can move.
    expect(movablePieces(state)).toHaveLength(17)
    expect(legalTargets(state, at(2, 6))).toEqual([at(2, 5)])
  })

  it('finds the attackers of a square and the checking pieces', () => {
    const state = createGameState('4k4/9/9/9/4r4/9/9/9/4K4 b - 1')
    expect(attackersOf(4, 8, 'gote', state.board)).toEqual([at(4, 4)])
    expect(checkingPieces('sente', state.board)).toEqual([at(4, 4)])
  })

  it('never offers nifu or uchifuzume drops', () => {
    const nifu = createGameState('4k4/9/9/9/9/9/4P4/9/4K4 b P 1')
    expect(legalDrops(nifu, 'FU').some((s) => s.x === 4)).toBe(false)
    // 打ち歩詰め: king in the corner, its own knight and pawn block 2a/2b, the
    // gold on 1c guards 1b — a pawn on 1b would be mate.
    const uchi = createGameState(UCHIFUZUME)
    expect(legalDrops(uchi, 'FU').some((s) => s.x === 8 && s.y === 1)).toBe(false)
  })
})

describe('refusals', () => {
  it('explains a pinned piece', () => {
    const state = createGameState('4r3k/9/9/9/9/9/9/4B4/4K4 b - 1')
    expect(legalTargets(state, at(4, 7))).toEqual([])
    const refusal = explainNoMoves(state, at(4, 7))
    expect(refusal.kind).toBe('pinned')
    expect(refusal.kind === 'pinned' && refusal.attacker).toEqual(at(4, 0))
  })

  it('explains that the king is in check', () => {
    const state = createGameState('4k4/9/9/9/4r4/9/9/P8/4K4 b - 1')
    // The pawn on 9h cannot stop the check from 5e.
    expect(explainNoMoves(state, at(0, 7)).kind).toBe('in_check')
  })

  it('explains a move that walks into an attack', () => {
    const state = createGameState('4k4/9/9/9/9/9/9/5r3/4K4 b - 1')
    // King 5i → 4i is attacked by the rook on 4h.
    expect(explainRejectedMove(state, at(4, 8), at(5, 8)).kind).toBe('exposes_king')
    // An unreachable target just clears the selection.
    expect(explainRejectedMove(state, at(4, 8), at(4, 4)).kind).toBe('unreachable')
  })

  it('explains rejected drops', () => {
    const nifu = createGameState('4k4/9/9/9/9/9/4P4/9/4K4 b PL 1')
    expect(explainRejectedDrop(nifu, 'FU', at(4, 3)).kind).toBe('nifu')
    expect(explainRejectedDrop(nifu, 'KY', at(1, 0)).kind).toBe('no_future')
    const uchi = createGameState(UCHIFUZUME)
    expect(explainRejectedDrop(uchi, 'FU', at(8, 1)).kind).toBe('uchifuzume')
    const check = createGameState('4k4/9/9/9/4r4/9/9/9/4K4 b G 1')
    expect(explainRejectedDrop(check, 'KI', at(0, 0)).kind).toBe('drop_in_check')
    expect(explainNoDrops(check).kind).toBe('drop_in_check')
  })
})
