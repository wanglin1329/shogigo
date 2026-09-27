// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest'

import { atEnd, currentState, openRecord, play, resign, seek, visibleOutcome } from '../../src/games/shogi/core/record'
import { parseUsiMove } from '../../src/games/shogi/core/kifu/moves'

const move = (usi: string) => parseUsiMove(usi)!

describe('game record', () => {
  it('opens a record and replays it', () => {
    const view = openRecord({ initialSfen: null, moves: ['7g7f', '3c3d'] })
    expect(view.cursor).toBe(2)
    expect(view.states).toHaveLength(3)
    expect(currentState(view).currentPlayer).toBe('sente')
    expect(atEnd(view)).toBe(true)
  })

  it('drops everything after the first illegal move', () => {
    const view = openRecord({ initialSfen: null, moves: ['7g7f', '7g7f', '3c3d'] })
    expect(view.record.moves).toEqual(['7g7f'])
  })

  it('clamps the cursor', () => {
    expect(openRecord({ initialSfen: null, moves: ['7g7f'] }, 9).cursor).toBe(1)
    expect(openRecord({ initialSfen: null, moves: ['7g7f'] }, -3).cursor).toBe(0)
  })

  it('undo/redo only move the cursor', () => {
    const view = openRecord({ initialSfen: null, moves: ['7g7f', '3c3d'] })
    const back = seek(view, 1)
    expect(back.record.moves).toEqual(['7g7f', '3c3d'])
    expect(currentState(back).currentPlayer).toBe('gote')
    expect(atEnd(back)).toBe(false)
    expect(seek(back, 2).cursor).toBe(2)
  })

  it('playing from an earlier position cuts off the later moves', () => {
    const view = seek(openRecord({ initialSfen: null, moves: ['7g7f', '3c3d', '2g2f'] }), 1)
    const branched = play(view, move('8c8d'))
    expect(branched.record.moves).toEqual(['7g7f', '8c8d'])
    expect(branched.cursor).toBe(2)
    expect(branched.states).toHaveLength(3)
  })

  it('rejects an illegal move', () => {
    expect(() => play(openRecord({ initialSfen: null, moves: [] }), move('7g7e'))).toThrow()
  })

  it('records checkmate as the outcome', () => {
    // 頭金: gote king 5a, sente pawn 5c, sente drops a gold on 5b.
    const view = openRecord({ initialSfen: '4k4/9/4P4/9/9/9/9/9/4K4 b G 1', moves: [] })
    const mated = play(view, move('G*5b'))
    expect(mated.outcome).toEqual({ winner: 'sente', reason: 'checkmate', plies: 1 })
    expect(visibleOutcome(mated)).not.toBeNull()
    // The outcome is only "visible" on the final position.
    expect(visibleOutcome(seek(mated, 0))).toBeNull()
  })

  it('resignation ends the game at the displayed position', () => {
    const view = seek(openRecord({ initialSfen: null, moves: ['7g7f', '3c3d', '2g2f'] }), 2)
    const resigned = resign(view, 'sente')
    expect(resigned.record.moves).toEqual(['7g7f', '3c3d'])
    expect(resigned.outcome).toEqual({ winner: 'gote', reason: 'resign', plies: 2 })
  })

  it('starts from an SFEN position', () => {
    const view = openRecord({ initialSfen: '4k4/9/9/9/9/9/9/9/4K4 b R 1', moves: ['R*5e'] })
    expect(currentState(view).isCheck).toBe(true)
    expect(view.record.initialSfen).toBe('4k4/9/9/9/9/9/9/9/4K4 b R 1')
  })
})
