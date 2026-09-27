// SPDX-License-Identifier: GPL-3.0-only

// AI layer (docs/PLAN.md §5.2). Two classic workers served from
// public/games/shogi/engine/ (never bundled):
//   - ai-worker.js        入門〜超級, upstream JS engine used verbatim
//   - yaneuraou-worker.js 達人級〜伝説3, our wrapper around the やねうら王 wasm
// Every answer is checked with the core rules engine before it reaches the UI.

import { applyMove, toUsiMoveString } from '../core/engine'
import type { BasePieceType, Captured, GameState, Move, Player } from '../core/engine'
import { FALLBACK_AI_LEVEL, getAiLevel } from './levels'
import type { AiDiagnostics, AiLevelId, AiRequest, AiResult, ShogiAi } from './types'
import { parseUsiMove } from './usi'

export { AI_LEVELS, DEFAULT_AI_LEVEL, getAiLevel, isAiLevelId, levelOptions } from './levels'
export type { AiDiagnostics, AiLevelId, AiRequest, AiResult, ShogiAi } from './types'

export const JS_WORKER_URL = '/games/shogi/engine/ai-worker.js'
export const YANEURAOU_WORKER_URL = '/games/shogi/engine/yaneuraou-worker.js'

/** The subset of `Worker` the adapter uses (tests pass fakes). */
export interface WorkerLike {
  postMessage(message: unknown): void
  terminate(): void
  onmessage: ((event: { data: unknown }) => void) | null
  onerror: ((event: unknown) => void) | null
}

export interface ShogiAiOptions {
  createWorker?: (url: string) => WorkerLike
  /** Budget for one やねうら王 answer including loading (then: terminate + fall back). */
  yaneuraouTimeoutMs?: number
  /** Budget for one JS answer (then: terminate + reject). */
  jsTimeoutMs?: number
}

const HAND_KEYS: readonly BasePieceType[] = ['HI', 'KA', 'KI', 'GI', 'KE', 'KY', 'FU']

function abortError(): Error {
  const error = new Error('AI request superseded')
  error.name = 'AbortError'
  return error
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function defaultCreateWorker(url: string): WorkerLike {
  if (typeof Worker === 'undefined') throw new Error('Web Workers are not available')
  return new Worker(url) as unknown as WorkerLike
}

/** ai-worker.js does `capturedPieces[owner][type]++`, so every key must exist. */
function fullHands(state: GameState): Record<Player, Captured> {
  const hand = (side: Player) =>
    Object.fromEntries(HAND_KEYS.map((key) => [key, state.capturedPieces[side]?.[key] ?? 0])) as Captured
  return { sente: hand('sente'), gote: hand('gote') }
}

type LastMoveDetail =
  | { fromX: number; fromY: number; toX: number; toY: number }
  | { drop: true; pieceType: string; toX: number; toY: number; fromX: null; fromY: null }

function lastMoveDetail(usiMoves: readonly string[]): LastMoveDetail | null {
  const last = usiMoves.length ? parseUsiMove(usiMoves[usiMoves.length - 1]) : null
  if (!last) return null
  if (last.type === 'drop') {
    return { drop: true, pieceType: last.pieceType, toX: last.toX, toY: last.toY, fromX: null, fromY: null }
  }
  return { fromX: last.fromX, fromY: last.fromY, toX: last.toX, toY: last.toY }
}

/** Returns a clean, legal Move, or null. */
function legalMove(state: GameState, candidate: unknown): Move | null {
  if (!candidate || typeof candidate !== 'object') return null
  const c = candidate as Record<string, unknown>
  let move: Move
  if (c.type === 'drop' && HAND_KEYS.includes(c.pieceType as BasePieceType)) {
    move = { type: 'drop', pieceType: c.pieceType as BasePieceType, toX: Number(c.toX), toY: Number(c.toY) }
  } else if (c.type === 'move') {
    move = {
      type: 'move',
      fromX: Number(c.fromX),
      fromY: Number(c.fromY),
      toX: Number(c.toX),
      toY: Number(c.toY),
      promote: c.promote === true,
    }
  } else {
    return null
  }
  try {
    applyMove(state, move)
    return move
  } catch {
    return null
  }
}

type Pending<T> = { resolve: (value: T) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }

type JsAnswer = { move: unknown; currentJosekiPattern: string | null; josekiMoveIndex: number; thinkingTime: number }
type YaneuraouAnswer = { usi: string; thinkingMs: number }

type Joseki = { pattern: string | null; index: number }

export function createShogiAi(options: ShogiAiOptions = {}): ShogiAi {
  const createWorker = options.createWorker ?? defaultCreateWorker
  const yaneuraouTimeoutMs = options.yaneuraouTimeoutMs ?? 60_000
  const jsTimeoutMs = options.jsTimeoutMs ?? 30_000

  let seq = 0
  let current = 0 // requestId of the request whose answer the UI still wants

  let jsWorker: WorkerLike | null = null
  const jsPending = new Map<number, Pending<JsAnswer>>()

  let yWorker: WorkerLike | null = null
  const yPending = new Map<number, Pending<YaneuraouAnswer>>()
  const diag: AiDiagnostics = { wasmVariant: null, yaneuraouState: 'idle', lastError: null }

  // Joseki state returned by ai-worker.js, keyed by the move history *after*
  // the AI's move. The next request looks it up with its history minus the
  // opponent's reply, so takebacks land on the right state automatically. The
  // reference site additionally bumped the index on the human's move; storing
  // `index + 1` here is that same step.
  const joseki = new Map<string, Joseki>()

  function fail<T>(pending: Map<number, Pending<T>>, error: Error) {
    for (const [, entry] of pending) {
      clearTimeout(entry.timer)
      entry.reject(error)
    }
    pending.clear()
  }

  function settle<T>(pending: Map<number, Pending<T>>, id: number): Pending<T> | null {
    const entry = pending.get(id)
    if (!entry) return null
    pending.delete(id)
    clearTimeout(entry.timer)
    return entry
  }

  function ensureJsWorker(): WorkerLike {
    if (jsWorker) return jsWorker
    const worker = createWorker(JS_WORKER_URL)
    worker.onmessage = (event) => {
      const data = event.data as { type?: string; data?: JsAnswer & { requestId: number } }
      if (data?.type !== 'bestMove' || !data.data) return
      settle(jsPending, data.data.requestId)?.resolve(data.data)
    }
    worker.onerror = () => {
      resetJsWorker()
      fail(jsPending, new Error('JS AI worker crashed'))
    }
    jsWorker = worker
    return worker
  }

  function resetJsWorker() {
    jsWorker?.terminate()
    jsWorker = null
  }

  function ensureYaneuraouWorker(): WorkerLike {
    if (yWorker) return yWorker
    const worker = createWorker(YANEURAOU_WORKER_URL)
    worker.onmessage = (event) => {
      const data = event.data as {
        type?: string
        requestId?: number
        usi?: string
        thinkingMs?: number
        variant?: string
        message?: string
      }
      if (data?.type === 'ready') {
        diag.yaneuraouState = 'ready'
        diag.wasmVariant = data.variant ?? diag.wasmVariant
      } else if (data?.type === 'bestmove' && typeof data.requestId === 'number') {
        diag.yaneuraouState = 'ready'
        settle(yPending, data.requestId)?.resolve({ usi: String(data.usi), thinkingMs: Number(data.thinkingMs) || 0 })
      } else if (data?.type === 'error') {
        const error = new Error(data.message || 'やねうら王 error')
        diag.lastError = error.message
        if (typeof data.requestId === 'number') {
          settle(yPending, data.requestId)?.reject(error)
        } else {
          // Initialization failed: use the JS engine for the rest of the session.
          diag.yaneuraouState = 'failed'
          resetYaneuraouWorker()
          fail(yPending, error)
        }
      }
    }
    worker.onerror = () => {
      diag.yaneuraouState = 'failed'
      diag.lastError = 'やねうら王 worker crashed'
      resetYaneuraouWorker()
      fail(yPending, new Error(diag.lastError))
    }
    yWorker = worker
    return worker
  }

  function resetYaneuraouWorker() {
    yWorker?.terminate()
    yWorker = null
  }

  function askJs(id: number, request: AiRequest, level: AiLevelId): Promise<JsAnswer> {
    const worker = ensureJsWorker()
    const history = request.usiMoves.slice(0, -1).join(' ')
    const state = request.initialSfen === null ? (joseki.get(history) ?? { pattern: null, index: 0 }) : null
    return new Promise<JsAnswer>((resolve, reject) => {
      const timer = setTimeout(() => {
        settle(jsPending, id)
        // ai-worker.js cannot be interrupted; a fresh worker is the only way out.
        resetJsWorker()
        reject(new Error('JS AI timeout'))
      }, jsTimeoutMs)
      jsPending.set(id, { resolve, reject, timer })
      worker.postMessage({
        type: 'getBestMove',
        data: {
          board: request.state.board,
          capturedPieces: fullHands(request.state),
          currentPlayer: request.state.currentPlayer,
          moveCount: request.usiMoves.length,
          lastMoveDetail: lastMoveDetail(request.usiMoves),
          aiDifficulty: level,
          aiPlayer: request.aiSide,
          josekiEnabled: state !== null && request.joseki !== false, // the joseki lines assume the 平手 start
          currentJosekiPattern: state?.pattern ?? null,
          josekiMoveIndex: state?.index ?? 0,
          ...(request.weakness ? { weakness: request.weakness } : {}),
          requestId: id,
        },
      })
    })
  }

  function askYaneuraou(id: number, request: AiRequest, nodes: number): Promise<YaneuraouAnswer> {
    const worker = ensureYaneuraouWorker()
    if (diag.yaneuraouState === 'idle') diag.yaneuraouState = 'loading'
    return new Promise<YaneuraouAnswer>((resolve, reject) => {
      const timer = setTimeout(() => {
        settle(yPending, id)
        // A running search cannot be stopped; start over with a new worker.
        diag.lastError = 'やねうら王 timeout'
        if (diag.yaneuraouState !== 'failed') diag.yaneuraouState = 'idle'
        resetYaneuraouWorker()
        reject(new Error(diag.lastError))
      }, yaneuraouTimeoutMs)
      yPending.set(id, { resolve, reject, timer })
      worker.postMessage({
        type: 'think',
        requestId: id,
        initialSfen: request.initialSfen,
        usiMoves: [...request.usiMoves],
        nodes,
      })
    })
  }

  function ensureCurrent(id: number) {
    if (id !== current) throw abortError()
  }

  async function answerWithJs(
    id: number,
    request: AiRequest,
    level: AiLevelId,
    fellBack: boolean,
    startedAt: number,
  ): Promise<AiResult> {
    const answer = await askJs(id, request, level)
    ensureCurrent(id)
    if (answer.move === null) return { kind: 'resign', thinkingMs: Date.now() - startedAt }
    const move = legalMove(request.state, answer.move)
    if (!move) {
      if (level !== FALLBACK_AI_LEVEL) return answerWithJs(id, request, FALLBACK_AI_LEVEL, true, startedAt)
      throw new Error('AI returned an illegal move')
    }
    const usi = toUsiMoveString(move)
    if (request.initialSfen === null) {
      joseki.set([...request.usiMoves, usi].join(' '), {
        pattern: answer.currentJosekiPattern,
        index: answer.josekiMoveIndex + 1,
      })
    }
    return { kind: 'move', move, usi, thinkingMs: Date.now() - startedAt, engine: 'js', fellBack }
  }

  async function requestMove(request: AiRequest): Promise<AiResult> {
    const id = ++seq
    supersede(id)
    const startedAt = Date.now()
    const level = getAiLevel(request.level)

    if (level.engine === 'js') return answerWithJs(id, request, level.id, false, startedAt)

    if (diag.yaneuraouState !== 'failed') {
      try {
        const answer = await askYaneuraou(id, request, level.nodes!)
        ensureCurrent(id)
        if (answer.usi === 'resign') return { kind: 'resign', thinkingMs: Date.now() - startedAt }
        if (answer.usi === 'win') return { kind: 'win', thinkingMs: Date.now() - startedAt }
        const parsed = parseUsiMove(answer.usi)
        const move = parsed && legalMove(request.state, parsed)
        if (move) {
          return {
            kind: 'move',
            move,
            usi: toUsiMoveString(move),
            thinkingMs: Date.now() - startedAt,
            engine: 'yaneuraou',
            fellBack: false,
          }
        }
        diag.lastError = `やねうら王 returned an illegal move: ${answer.usi}`
      } catch (error) {
        if (isAbortError(error)) throw error
        ensureCurrent(id)
        diag.lastError = error instanceof Error ? error.message : String(error)
      }
    }
    return answerWithJs(id, request, FALLBACK_AI_LEVEL, true, startedAt)
  }

  /** Makes `id` the only wanted request; older ones reject with AbortError. */
  function supersede(id: number) {
    current = id
    for (const pending of [jsPending, yPending] as Map<number, Pending<never>>[]) {
      for (const [otherId, entry] of pending) {
        if (otherId === id) continue
        clearTimeout(entry.timer)
        entry.reject(abortError())
        pending.delete(otherId)
      }
    }
  }

  return {
    prefetch() {
      if (diag.yaneuraouState === 'failed') return
      try {
        ensureYaneuraouWorker().postMessage({ type: 'prefetch' })
      } catch (error) {
        diag.yaneuraouState = 'failed'
        diag.lastError = error instanceof Error ? error.message : String(error)
      }
    },
    warmup(levelId) {
      if (getAiLevel(levelId).engine !== 'yaneuraou' || diag.yaneuraouState === 'failed') return
      try {
        ensureYaneuraouWorker().postMessage({ type: 'init' })
        if (diag.yaneuraouState === 'idle') diag.yaneuraouState = 'loading'
      } catch (error) {
        diag.yaneuraouState = 'failed'
        diag.lastError = error instanceof Error ? error.message : String(error)
      }
    },
    newGame() {
      joseki.clear()
      yWorker?.postMessage({ type: 'newGame' })
    },
    requestMove,
    cancel() {
      supersede(++seq)
      yWorker?.postMessage({ type: 'cancel' })
    },
    diagnostics() {
      return { ...diag }
    },
    dispose() {
      supersede(++seq)
      resetJsWorker()
      resetYaneuraouWorker()
    },
  }
}
