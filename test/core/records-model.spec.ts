// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2025~ Yuki Lab
// Copyright 2026 the shogi project contributors
// Modified 2026-09-27: our record model (modes, initialSfen, upsert by id).

import { describe, expect, it } from 'vitest'

import {
  applyGame,
  emptySummary,
  gameCounts,
  modeGroup,
  normalizeGame,
  opponentLabel,
  planSave,
  reasonLabel,
  resultLabel,
  touchedModes,
  updateSummary,
  winRate,
} from '../../src/games/shogi/core/records/model'
import type { GameInput, GameRecord, Summary } from '../../src/games/shogi/core/records/types'

const T0 = Date.UTC(2026, 8, 27)

function input(overrides: Partial<GameInput> = {}): GameInput {
  return {
    id: 'game-1',
    startedAt: T0,
    endedAt: T0 + 60_000,
    mode: 'ai',
    player: 'sente',
    winner: 'sente',
    reason: 'checkmate',
    initialSfen: null,
    moves: ['7g7f', '3c3d'],
    opponentName: 'AI',
    aiLevel: '中級',
    ...overrides,
  }
}

const game = (overrides: Partial<GameInput> = {}): GameRecord => normalizeGame(input(overrides))

describe('normalizeGame', () => {
  it('keeps the start position and a copy of the moves', () => {
    const moves = ['7g7f']
    const sfen = '4k4/9/9/9/9/9/9/9/4K4 b R 1'
    const g = normalizeGame(input({ moves, initialSfen: sfen }))
    moves.push('3c3d')
    expect(g.moves).toEqual(['7g7f'])
    expect(g.initialSfen).toBe(sfen)
    expect(game({ initialSfen: '' }).initialSfen).toBeNull()
  })

  it('rejects broken input so the save reports a failure', () => {
    expect(() => normalizeGame(input({ endedAt: T0 - 1 }))).toThrow(TypeError)
    expect(() => normalizeGame(input({ id: '' }))).toThrow(TypeError)
    expect(() => normalizeGame(input({ mode: 'friend' as never }))).toThrow(TypeError)
    expect(() => normalizeGame(input({ player: null }))).toThrow(TypeError)
    expect(() => normalizeGame(input({ winner: 'nobody' as never }))).toThrow(TypeError)
  })

  it('the 将棋盤 has no player side', () => {
    expect(game({ mode: 'board', player: 'sente' }).player).toBeNull()
  })

  it('keeps the AI level only in AI mode, the opponent rank only online', () => {
    expect(game({ mode: 'ai' }).aiLevel).toBe('中級')
    expect(game({ mode: 'online', aiLevel: '中級' }).aiLevel).toBeUndefined()
    expect(game({ mode: 'online', opponentRank: '3級', opponentRating: 1720 })).toMatchObject({ opponentRank: '3級', opponentRating: 1720 })
    expect(game({ mode: 'bot', opponentRank: '3級' }).opponentRank).toBeUndefined()
  })

  it('deduplicates waza ids', () => {
    expect(game({ wazaIds: ['yagura', 'yagura', 'bogin', ''] }).wazaIds).toEqual(['yagura', 'bogin'])
  })
})

describe('counts and summaries', () => {
  it('COM games are online games', () => {
    expect(modeGroup('bot')).toBe('online')
    expect(modeGroup('ai')).toBe('ai')
  })

  it('draws and the 将棋盤 are not in the win-rate denominator', () => {
    expect(gameCounts(game())).toEqual({ games: 1, wins: 1, losses: 0, draws: 0, eligible: 1 })
    expect(gameCounts(game({ winner: 'gote' }))).toEqual({ games: 1, wins: 0, losses: 1, draws: 0, eligible: 1 })
    expect(gameCounts(game({ winner: null }))).toEqual({ games: 1, wins: 0, losses: 0, draws: 1, eligible: 0 })
    expect(gameCounts(game({ mode: 'board', winner: 'sente' }))).toEqual({ games: 1, wins: 0, losses: 0, draws: 0, eligible: 0 })
  })

  it('adds and removes a game, per waza too, without mutating the input', () => {
    const before = emptySummary()
    const g = game({ wazaIds: ['yagura'] })
    const added = applyGame(before, g, 1)
    expect(before).toEqual(emptySummary())
    expect(added.games).toBe(1)
    expect(added.waza.yagura).toEqual({ games: 1, wins: 1, losses: 0, draws: 0, eligible: 1 })
    expect(applyGame(added, g, -1)).toEqual(emptySummary())
  })

  it('a waza called __proto__ stays an ordinary entry', () => {
    const s = applyGame(emptySummary(), game({ wazaIds: ['__proto__'] }), 1)
    expect(Object.hasOwn(s.waza, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(s.waza)).toBe(Object.prototype)
  })

  it('win rate', () => {
    expect(winRate({ games: 3, wins: 1, losses: 1, draws: 1, eligible: 2 })).toBe(50)
    expect(winRate({ games: 1, wins: 0, losses: 0, draws: 1, eligible: 0 })).toBeNull()
  })
})

describe('saving the same game again (upsert)', () => {
  function run(stored: GameRecord | null, next: GameRecord, summaries: Record<string, Summary>) {
    const plan = planSave(stored, next)
    const out = { ...summaries }
    for (const mode of plan.modes) out[mode] = updateSummary(out[mode] ?? emptySummary(), mode, stored, next)
    return { plan, summaries: out }
  }

  it('first save adds to all + its group', () => {
    const { plan, summaries } = run(null, game(), {})
    expect(plan.outcome).toBe('saved')
    expect(summaries.all.games).toBe(1)
    expect(summaries.ai.games).toBe(1)
    expect(summaries.online).toBeUndefined()
  })

  it('an identical save changes nothing', () => {
    const g = game()
    expect(planSave(g, game())).toEqual({ outcome: 'unchanged', modes: [] })
  })

  it('undo after the end, then a different ending: counted once, with the new result', () => {
    const lost = game({ winner: 'gote', moves: ['7g7f', '3c3d', '8h2b+'] })
    const first = run(null, lost, {})
    const won = game({ winner: 'sente', moves: ['7g7f', '3c3d', '2g2f'], endedAt: T0 + 120_000, wazaIds: ['bogin'] })
    const second = run(lost, won, first.summaries)
    expect(second.plan.outcome).toBe('updated')
    expect(second.summaries.all).toMatchObject({ games: 1, wins: 1, losses: 0, eligible: 1 })
    expect(second.summaries.ai).toMatchObject({ games: 1, wins: 1, losses: 0 })
    expect(second.summaries.all.waza.bogin.games).toBe(1)
  })

  it('an update that changes the mode group moves the game between buckets', () => {
    const asAi = game({ mode: 'ai' })
    const first = run(null, asAi, {})
    const asBot = game({ mode: 'bot' })
    expect(touchedModes(asAi, asBot).sort()).toEqual(['ai', 'all', 'online'])
    const second = run(asAi, asBot, first.summaries)
    expect(second.summaries.all.games).toBe(1)
    expect(second.summaries.ai.games).toBe(0)
    expect(second.summaries.online.games).toBe(1)
  })
})

describe('labels', () => {
  it('opponent', () => {
    expect(opponentLabel(game({ mode: 'ai', aiLevel: '伝説1' }))).toBe('AI 伝説1')
    expect(opponentLabel(game({ mode: 'bot', opponentName: 'COM' }))).toBe('COM')
    expect(opponentLabel(game({ mode: 'online', opponentName: 'taro', opponentRank: '5級' }))).toBe('taro 5級')
    expect(opponentLabel(game({ mode: 'online', opponentName: '' }))).toBe('匿名プレイヤー')
    expect(opponentLabel(game({ mode: 'board' }))).toBe('将棋盤')
  })

  it('result and reason', () => {
    expect(resultLabel(game())).toBe('勝ち')
    expect(resultLabel(game({ winner: 'gote' }))).toBe('負け')
    expect(resultLabel(game({ winner: null }))).toBe('引き分け')
    expect(resultLabel(game({ mode: 'board', winner: 'gote' }))).toBe('後手の勝ち')
    expect(reasonLabel('perpetual_check')).toBe('連続王手の千日手')
    expect(reasonLabel('whatever')).toBe('終局')
  })
})
