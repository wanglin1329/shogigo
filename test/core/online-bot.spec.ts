// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AiRequest, AiResult, ShogiAi } from '../../src/games/shogi/ai/types'
import type { Move } from '../../src/games/shogi/core/engine'
import { parseUsiMove } from '../../src/games/shogi/core/kifu/moves'
import {
  BOT_FLAG_GRACE_MS,
  BOT_START_BUFFER_MS,
  BOT_TC_SECONDS,
  BotGame,
  COM_MOVE_DELAY_MS,
  comLevelFor,
} from '../../src/games/shogi/online/botGame'
import type { BotGameOptions } from '../../src/games/shogi/online/botGame'
import { systemClock } from '../../src/games/shogi/online/store'
import { flush, installLocalStorage, uninstallLocalStorage } from './online-fakes'

const NOW = Date.parse('2026-09-27T10:00:00Z')
const OPTIONS: BotGameOptions = { ticket: 'tkt', level: 'medium', playerName: 'Alice', playerRank: 4, hideRank: false }
const mv = (usi: string) => parseUsiMove(usi) as Move

/** An AI that answers from a script of USI moves (or a special result). */
function scriptedAi(answers: (string | AiResult)[]) {
  const requests: AiRequest[] = []
  const ai: ShogiAi = {
    prefetch() {},
    warmup() {},
    newGame() {},
    cancel() {},
    dispose() {},
    diagnostics: () => ({ wasmVariant: null, yaneuraouState: 'idle', lastError: null }),
    async requestMove(request) {
      requests.push(request)
      const next = answers.shift()
      if (!next) throw new Error('no more answers')
      if (typeof next !== 'string') return next
      return { kind: 'move', move: mv(next), usi: next, thinkingMs: 1, engine: 'js', fellBack: false }
    },
  }
  return { ai, requests }
}

function setup(side: 'sente' | 'gote', answers: (string | AiResult)[] = [], options: Partial<BotGameOptions> = {}) {
  const { ai, requests } = scriptedAi(answers)
  const postBotResult = vi.fn(async () => ({
    ok: true as const,
    outcome: {
      rated: true,
      rating: { rank: 4, rankLabel: '5級', rating: 1512, progress: 0.1, nextLabel: '4級', pointsToNext: 88, tier: 1 },
      ratingDelta: 12,
      promotedTo: null,
      skipped: null,
    },
  }))
  const game = new BotGame(
    { ...OPTIONS, ...options },
    { clock: systemClock, createAi: () => ai, randomSide: () => side, api: { postBotResult } },
  )
  game.start()
  return { game, requests, postBotResult }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  installLocalStorage()
})
afterEach(() => {
  vi.useRealTimers()
  uninstallLocalStorage()
})

describe('COM game', () => {
  it('rounds やねうら王 levels down to 超級', () => {
    expect(comLevelFor('legendary3')).toBe('super')
    expect(comLevelFor('hard')).toBe('hard')
  })

  it('looks like a matchmaking room with a 30 s clock and the 5 s start buffer', () => {
    const { game } = setup('sente')
    const { match, yourSide } = game.get()
    expect(yourSide).toBe('sente')
    expect(match).toMatchObject({ room_code: 'LOCAL', match_type: 'matchmaking', tc_type: 'per_move', tc_seconds: 30 })
    expect(match.sente_name).toBe('Alice')
    expect(match.gote_name).toBe('COM')
    expect(match.sente_rank).toBe(4)
    expect(Date.parse(match.turn_deadline!)).toBe(NOW + BOT_START_BUFFER_MS + BOT_TC_SECONDS * 1000)
  })

  it('the COM opens after 700 ms when it plays 先手', async () => {
    const { game, requests } = setup('gote', ['7g7f'])
    vi.advanceTimersByTime(COM_MOVE_DELAY_MS - 1)
    expect(requests).toHaveLength(0)
    vi.advanceTimersByTime(1)
    await flush()
    expect(requests[0]).toMatchObject({ level: 'medium', aiSide: 'sente', usiMoves: [] })
    expect(game.get().match.state.usiMoveHistory).toEqual(['7g7f'])
    expect(game.get().match.revision).toBe(1)
  })

  it('answers the player’s move and refuses moves out of turn', async () => {
    const { game, requests } = setup('sente', ['3c3d'])
    expect(game.playMove(mv('3c3d'))).toBe(false) // gote's move, not ours
    expect(game.playMove(mv('7g7f'))).toBe(true)
    vi.advanceTimersByTime(COM_MOVE_DELAY_MS)
    await flush()
    expect(requests[0].usiMoves).toEqual(['7g7f'])
    expect(game.get().view.record.moves).toEqual(['7g7f', '3c3d'])
    expect(Date.parse(game.get().match.turn_deadline!)).toBe(NOW + COM_MOVE_DELAY_MS + BOT_TC_SECONDS * 1000)
  })

  it('the player loses on time 1 s after the deadline and the loss is reported once, without kifu', async () => {
    const { game, postBotResult } = setup('sente')
    vi.advanceTimersByTime(BOT_START_BUFFER_MS + BOT_TC_SECONDS * 1000 + BOT_FLAG_GRACE_MS - 1)
    expect(game.get().match.game_over).toBe(false)
    vi.advanceTimersByTime(1)
    await flush()
    expect(game.get().match).toMatchObject({ game_over: true, winner: 'gote', result_reason: 'timeout' })
    expect(postBotResult).toHaveBeenCalledTimes(1)
    expect(postBotResult).toHaveBeenCalledWith({ ticket: 'tkt', side: 'sente', result: 'lose', difficulty: 'medium' })
    game.resign()
    expect(postBotResult).toHaveBeenCalledTimes(1)
    expect(game.get().report.status).toBe('done')
  })

  it('a COM with no legal move loses by checkmate; the win carries the kifu', async () => {
    const { game, postBotResult } = setup('sente', [{ kind: 'resign', thinkingMs: 1 }])
    game.playMove(mv('7g7f'))
    vi.advanceTimersByTime(COM_MOVE_DELAY_MS)
    await flush()
    expect(game.get().match).toMatchObject({ game_over: true, winner: 'sente', result_reason: 'checkmate' })
    expect(postBotResult).toHaveBeenCalledWith(expect.objectContaining({ result: 'win', moves: ['7g7f'] }))
  })

  it('resigning is a loss; an unrated game reports nothing', async () => {
    const { game, postBotResult } = setup('sente', [], { ticket: null })
    game.resign()
    await flush()
    expect(game.get().match).toMatchObject({ game_over: true, winner: 'gote', result_reason: 'resign' })
    expect(postBotResult).not.toHaveBeenCalled()
    expect(game.get().report.status).toBe('none')
  })

  it('an AI that cannot answer ends the game as a COM disconnect', async () => {
    const { game } = setup('gote', [])
    vi.advanceTimersByTime(COM_MOVE_DELAY_MS)
    await flush()
    expect(game.get().match).toMatchObject({ game_over: true, winner: 'gote', result_reason: 'disconnect' })
  })

  it('survives a StrictMode-style dispose and restart', async () => {
    const { game, requests } = setup('gote', ['7g7f'])
    game.dispose()
    game.start()
    vi.advanceTimersByTime(COM_MOVE_DELAY_MS)
    await flush()
    expect(requests).toHaveLength(1)
    expect(game.get().view.record.moves).toEqual(['7g7f'])
  })
})
