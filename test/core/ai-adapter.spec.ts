// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest'

import { applyMove, createInitialGameState } from '../../src/games/shogi/core/engine'
import type { GameState } from '../../src/games/shogi/core/engine'
import {
  JS_WORKER_URL,
  YANEURAOU_WORKER_URL,
  createShogiAi,
  isAbortError,
} from '../../src/games/shogi/ai'
import type { WorkerLike } from '../../src/games/shogi/ai'
import type { AiLevelId, AiRequest } from '../../src/games/shogi/ai/types'
import { parseUsiMove } from '../../src/games/shogi/ai/usi'

class FakeWorker implements WorkerLike {
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  sent: any[] = []
  terminated = false
  constructor(readonly url: string) {}
  postMessage(message: unknown) {
    this.sent.push(message)
  }
  terminate() {
    this.terminated = true
  }
  emit(data: unknown) {
    this.onmessage?.({ data })
  }
  last(type: string) {
    return [...this.sent].reverse().find((m) => m.type === type)
  }
}

function setup(options: { yaneuraouTimeoutMs?: number; jsTimeoutMs?: number } = {}) {
  const workers: FakeWorker[] = []
  const ai = createShogiAi({
    createWorker: (url) => {
      const worker = new FakeWorker(url)
      workers.push(worker)
      return worker
    },
    ...options,
  })
  const js = () => workers.filter((w) => w.url === JS_WORKER_URL).at(-1)!
  const yane = () => workers.filter((w) => w.url === YANEURAOU_WORKER_URL).at(-1)!
  return { ai, workers, js, yane }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function play(usiMoves: string[]): GameState {
  let state = createInitialGameState()
  for (const usi of usiMoves) state = applyMove(state, parseUsiMove(usi)!).state
  return state
}

function request(level: AiLevelId, usiMoves: string[] = [], aiSide: 'sente' | 'gote' = 'sente'): AiRequest {
  return { level, initialSfen: null, usiMoves, state: play(usiMoves), aiSide }
}

// 7g7f as ai-worker.js reports it (board[y][x], x = 9 - file).
const JS_7G7F = { type: 'move', fromX: 2, fromY: 6, toX: 2, toY: 5, promote: false }
const JS_ILLEGAL = { type: 'move', fromX: 2, fromY: 6, toX: 2, toY: 3, promote: false }

function jsAnswer(worker: FakeWorker, move: unknown, joseki: { pattern: string | null; index: number } = { pattern: null, index: 0 }) {
  const req = worker.last('getBestMove').data
  worker.emit({
    type: 'bestMove',
    data: { move, currentJosekiPattern: joseki.pattern, josekiMoveIndex: joseki.index, thinkingTime: 1, requestId: req.requestId },
  })
}

describe('ShogiAi adapter', () => {
  it('does not touch Worker until needed (SSR-safe)', () => {
    expect(() => createShogiAi()).not.toThrow()
  })

  it('sends the ai-worker.js contract and returns a validated move', async () => {
    const { ai, js } = setup()
    const promise = ai.requestMove(request('medium'))
    const sent = js().last('getBestMove').data
    expect(sent.aiDifficulty).toBe('medium')
    expect(Object.keys(sent.capturedPieces.sente).sort()).toEqual(['FU', 'GI', 'HI', 'KA', 'KE', 'KI', 'KY'])
    expect(sent).toMatchObject({ moveCount: 0, lastMoveDetail: null, josekiEnabled: true, aiPlayer: 'sente' })
    jsAnswer(js(), JS_7G7F)
    await expect(promise).resolves.toMatchObject({ kind: 'move', usi: '7g7f', engine: 'js', fellBack: false })
  })

  it('retries an illegal JS answer with 超級, then gives up', async () => {
    const { ai, js } = setup()
    const promise = ai.requestMove(request('easy'))
    jsAnswer(js(), JS_ILLEGAL)
    await tick()
    expect(js().last('getBestMove').data.aiDifficulty).toBe('super')
    jsAnswer(js(), JS_7G7F)
    await expect(promise).resolves.toMatchObject({ kind: 'move', usi: '7g7f', fellBack: true })

    const second = ai.requestMove(request('super'))
    jsAnswer(js(), JS_ILLEGAL)
    await expect(second).rejects.toThrow('illegal')
  })

  it('maps a null JS answer to resign', async () => {
    const { ai, js } = setup()
    const promise = ai.requestMove(request('hard'))
    jsAnswer(js(), null)
    await expect(promise).resolves.toMatchObject({ kind: 'resign' })
  })

  it('asks やねうら王 with the node budget and the full history', async () => {
    const { ai, yane } = setup()
    const promise = ai.requestMove(request('legendary1', ['7g7f'], 'gote'))
    expect(yane().last('think')).toMatchObject({ initialSfen: null, usiMoves: ['7g7f'], nodes: 90_000 })
    yane().emit({ type: 'bestmove', requestId: yane().last('think').requestId, usi: '3c3d', thinkingMs: 12 })
    await expect(promise).resolves.toMatchObject({ kind: 'move', usi: '3c3d', engine: 'yaneuraou', fellBack: false })
  })

  it('passes a non-平手 start to やねうら王 and disables joseki', async () => {
    const { ai, yane, js } = setup()
    const sfen = '4k4/9/9/9/9/9/9/9/4K4 b G 1'
    const state = createInitialGameState()
    const p = ai.requestMove({ level: 'master', initialSfen: sfen, usiMoves: [], state, aiSide: 'sente' })
    expect(yane().last('think').initialSfen).toBe(sfen)
    yane().emit({ type: 'bestmove', requestId: yane().last('think').requestId, usi: '7g7f', thinkingMs: 1 })
    await p

    const q = ai.requestMove({ level: 'medium', initialSfen: sfen, usiMoves: [], state, aiSide: 'sente' })
    expect(js().last('getBestMove').data.josekiEnabled).toBe(false)
    jsAnswer(js(), JS_7G7F)
    await q
  })

  it('reports resign and entering-king win from やねうら王 as such', async () => {
    const { ai, yane } = setup()
    const a = ai.requestMove(request('master'))
    yane().emit({ type: 'bestmove', requestId: yane().last('think').requestId, usi: 'win', thinkingMs: 1 })
    await expect(a).resolves.toMatchObject({ kind: 'win' })
    const b = ai.requestMove(request('master'))
    yane().emit({ type: 'bestmove', requestId: yane().last('think').requestId, usi: 'resign', thinkingMs: 1 })
    await expect(b).resolves.toMatchObject({ kind: 'resign' })
  })

  it('falls back to JS 超級 when やねうら王 answers an illegal move', async () => {
    const { ai, yane, js } = setup()
    const promise = ai.requestMove(request('great'))
    yane().emit({ type: 'bestmove', requestId: yane().last('think').requestId, usi: '5a5b', thinkingMs: 1 })
    await tick()
    expect(js().last('getBestMove').data.aiDifficulty).toBe('super')
    jsAnswer(js(), JS_7G7F)
    await expect(promise).resolves.toMatchObject({ kind: 'move', engine: 'js', fellBack: true })
    expect(ai.diagnostics().lastError).toContain('illegal')
  })

  it('stops using やねうら王 after an initialization failure', async () => {
    const { ai, yane, js } = setup()
    const first = ai.requestMove(request('master'))
    const failed = yane()
    failed.emit({ type: 'error', message: 'Failed to load YaneuraOu script' })
    await tick()
    expect(failed.terminated).toBe(true)
    jsAnswer(js(), JS_7G7F)
    await expect(first).resolves.toMatchObject({ fellBack: true })
    expect(ai.diagnostics().yaneuraouState).toBe('failed')

    const second = ai.requestMove(request('master'))
    expect(js().last('getBestMove').data.aiDifficulty).toBe('super')
    jsAnswer(js(), JS_7G7F)
    await expect(second).resolves.toMatchObject({ engine: 'js', fellBack: true })
  })

  it('times out やねうら王, recycles the worker and falls back', async () => {
    const { ai, yane, js } = setup({ yaneuraouTimeoutMs: 20 })
    const promise = ai.requestMove(request('legendary3'))
    const stuck = yane()
    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(stuck.terminated).toBe(true)
    jsAnswer(js(), JS_7G7F)
    await expect(promise).resolves.toMatchObject({ fellBack: true })
    // A later request gets a fresh worker.
    void ai.requestMove(request('master')).catch(() => {})
    expect(yane()).not.toBe(stuck)
  })

  it('rejects a superseded request with AbortError and ignores its late answer', async () => {
    const { ai, js } = setup()
    const first = ai.requestMove(request('medium'))
    const firstId = js().last('getBestMove').data.requestId
    const second = ai.requestMove(request('medium'))
    await expect(first).rejects.toSatisfy(isAbortError)
    js().emit({ type: 'bestMove', data: { move: JS_7G7F, currentJosekiPattern: null, josekiMoveIndex: 0, thinkingTime: 1, requestId: firstId } })
    jsAnswer(js(), JS_7G7F)
    await expect(second).resolves.toMatchObject({ kind: 'move' })
  })

  it('cancel() rejects the pending request and tells やねうら王', async () => {
    const { ai, yane } = setup()
    const promise = ai.requestMove(request('master'))
    ai.cancel()
    await expect(promise).rejects.toSatisfy(isAbortError)
    expect(yane().last('cancel')).toBeTruthy()
  })

  it('carries the joseki state through the game and across takebacks', async () => {
    const { ai, js } = setup()
    const first = ai.requestMove(request('medium'))
    jsAnswer(js(), { type: 'move', fromX: 7, fromY: 6, toX: 7, toY: 5, promote: false }, { pattern: 'kakugawari', index: 1 })
    await expect(first).resolves.toMatchObject({ usi: '2g2f' })

    // Human replies 8c8d; the AI is asked again: pattern continues at index 2.
    const second = ai.requestMove(request('medium', ['2g2f', '8c8d']))
    expect(js().last('getBestMove').data).toMatchObject({
      currentJosekiPattern: 'kakugawari',
      josekiMoveIndex: 2,
      moveCount: 2,
      lastMoveDetail: { fromX: 1, fromY: 2, toX: 1, toY: 3 },
    })
    jsAnswer(js(), JS_7G7F)
    await second

    // Taking back to the same point gives the same state again.
    const again = ai.requestMove(request('medium', ['2g2f', '8c8d']))
    expect(js().last('getBestMove').data.josekiMoveIndex).toBe(2)
    jsAnswer(js(), JS_7G7F)
    await again

    ai.newGame()
    const fresh = ai.requestMove(request('medium', ['2g2f', '8c8d']))
    expect(js().last('getBestMove').data.currentJosekiPattern).toBeNull()
    jsAnswer(js(), JS_7G7F)
    await fresh
  })

  it('newGame tells やねうら王 to reset', async () => {
    const { ai, yane } = setup()
    ai.warmup('master')
    expect(yane().last('init')).toBeTruthy()
    ai.newGame()
    expect(yane().last('newGame')).toBeTruthy()
  })
})
