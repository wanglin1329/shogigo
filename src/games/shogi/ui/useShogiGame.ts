// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useRef, useState } from 'react'

import type { Player } from '../core/engine'
import { openRecord, resign, seek } from '../core/record'
import type { GameRecord, GameView } from '../core/record'
import { readJson, writeJson } from '../../../site/storage'

interface SavedGame {
  v: 1
  record: GameRecord
  cursor: number
  resignedBy: Player | null
}

export const EMPTY_RECORD: GameRecord = { initialSfen: null, moves: [] }

function load(storageKey: string): GameView | null {
  const saved = readJson<SavedGame>(storageKey)
  if (!saved || saved.v !== 1 || !saved.record || !Array.isArray(saved.record.moves)) return null
  const initialSfen = typeof saved.record.initialSfen === 'string' ? saved.record.initialSfen : null
  let view: GameView
  try {
    view = openRecord({ initialSfen, moves: saved.record.moves.map(String) }, saved.cursor)
  } catch {
    return null // unreadable start position
  }
  if (saved.resignedBy && !view.outcome) {
    view = seek(resign(seek(view, view.record.moves.length), saved.resignedBy), saved.cursor)
  }
  return view
}

/**
 * The game on the board, autosaved after every change (docs/PLAN.md §5.3-3).
 * The first render is always the start position — identical to the
 * prerendered HTML — and a saved game is restored after hydration.
 *
 * `update` applies a change and returns the new view immediately, so the
 * caller can react to a game ending exactly once.
 *
 * While `persist` is false (viewing a shared kifu) nothing is written, so the
 * player's own saved game survives until they start playing from the kifu.
 */
export function useShogiGame(storageKey: string, persist = true) {
  const [view, setView] = useState<GameView>(() => openRecord(EMPTY_RECORD))
  const current = useRef(view)
  const [restored, setRestored] = useState(false)

  const update = useCallback((change: (v: GameView) => GameView): GameView => {
    const next = change(current.current)
    current.current = next
    setView(next)
    return next
  }, [])

  useEffect(() => {
    const saved = load(storageKey)
    if (saved) update(() => saved)
    setRestored(true)
  }, [storageKey, update])

  useEffect(() => {
    // Until the save is read, `view` is the start position: never write it over the save.
    if (!restored || !persist) return
    const resignedBy =
      view.outcome?.reason === 'resign' ? (view.outcome.winner === 'sente' ? 'gote' : 'sente') : null
    writeJson(storageKey, { v: 1, record: view.record, cursor: view.cursor, resignedBy } satisfies SavedGame)
  }, [view, restored, persist, storageKey])

  /** Re-reads the saved game (leaving a shared kifu). */
  const reload = useCallback(() => update(() => load(storageKey) ?? openRecord(EMPTY_RECORD)), [storageKey, update])

  return { view, restored, update, reload }
}
