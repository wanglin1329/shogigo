// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef, useState } from 'react'

import { createShogiAi } from '../ai'
import type { AiLevelId, AiResult, ShogiAi } from '../ai/types'
import type { Move, Player } from '../core/engine'
import { atEnd, currentState } from '../core/record'
import type { GameView } from '../core/record'

/** Even a 5 ms answer waits this long, so the AI never "teleports". */
const MIN_THINK_MS = 600

const YANEURAOU_LEVELS: ReadonlySet<AiLevelId> = new Set([
  'master',
  'great',
  'transcendent',
  'legendary1',
  'legendary2',
  'legendary3',
])

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Identifies the game a request was made for. The caller must ignore an
 * answer whose key no longer matches the game on the board: a reset, undo or
 * level change can land between the answer and React's effect cleanup.
 */
export function positionKey(view: GameView): string {
  return `${view.record.initialSfen ?? 'startpos'}|${view.record.moves.join(' ')}|${view.cursor}`
}

export interface AiCallbacks {
  onMove: (move: Move, key: string) => void
  /** The AI has no legal move or resigned. */
  onResign: (key: string) => void
  /** Entering-king declaration (should not occur with NoEnteringKing). */
  onWin: (key: string) => void
  onError: (error: Error) => void
}

/**
 * Asks the AI for a move whenever it is the AI's turn at the end of the game
 * record. Any change to the game (undo, reset, level change) invalidates the
 * pending request.
 */
export function useAiOpponent(options: {
  enabled: boolean
  view: GameView
  level: AiLevelId
  aiSide: Player
  callbacks: AiCallbacks
}) {
  const { enabled, view, level, aiSide } = options
  const ai = useRef<ShogiAi | null>(null)
  const callbacks = useRef(options.callbacks)
  callbacks.current = options.callbacks
  const [thinking, setThinking] = useState(false)
  /** Bumped by cancel(): answers from an older generation are dropped even mid-wait. */
  const generation = useRef(0)

  useEffect(() => {
    const instance = createShogiAi()
    ai.current = instance
    return () => {
      instance.dispose()
      ai.current = null
    }
  }, [])

  // Warm the engine when the page is idle, never on the critical path.
  useEffect(() => {
    let handle = 0
    const warm = () => {
      if (YANEURAOU_LEVELS.has(level)) ai.current?.warmup(level)
      else ai.current?.prefetch()
    }
    const schedule = () => {
      handle = window.requestIdleCallback
        ? window.requestIdleCallback(warm, { timeout: 3000 })
        : window.setTimeout(warm, 1500)
    }
    if (document.readyState === 'complete') schedule()
    else window.addEventListener('load', schedule, { once: true })
    return () => {
      window.removeEventListener('load', schedule)
      if (window.cancelIdleCallback) window.cancelIdleCallback(handle)
      else window.clearTimeout(handle)
    }
  }, [level])

  useEffect(() => {
    const state = currentState(view)
    if (!enabled || !ai.current || !atEnd(view) || view.outcome || state.currentPlayer !== aiSide) {
      setThinking(false)
      return
    }
    let alive = true
    const gen = generation.current
    const key = positionKey(view)
    const started = performance.now()
    setThinking(true)
    ai.current
      .requestMove({
        level,
        initialSfen: view.record.initialSfen,
        usiMoves: view.record.moves,
        state,
        aiSide,
      })
      .then(async (result: AiResult) => {
        const wait = MIN_THINK_MS - (performance.now() - started)
        if (wait > 0) await sleep(wait)
        if (!alive || gen !== generation.current) return
        setThinking(false)
        if (result.kind === 'move') callbacks.current.onMove(result.move, key)
        else if (result.kind === 'resign') callbacks.current.onResign(key)
        else callbacks.current.onWin(key)
      })
      .catch((error: Error) => {
        if (!alive || gen !== generation.current || error.name === 'AbortError') return
        setThinking(false)
        callbacks.current.onError(error)
      })
    return () => {
      alive = false
      ai.current?.cancel()
    }
  }, [enabled, view, level, aiSide])

  return {
    thinking,
    /** Drop the pending answer now (the effect cleanup would do it one render later). */
    cancel: () => {
      generation.current++
      ai.current?.cancel()
      setThinking(false)
    },
    newGame: () => ai.current?.newGame(),
    diagnostics: () => ai.current?.diagnostics() ?? null,
  }
}
