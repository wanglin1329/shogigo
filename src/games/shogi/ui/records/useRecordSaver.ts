// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useRef, useState } from 'react'

import { saveGameRecord } from '../../records'
import type { GameInput, SaveStatus } from '../../records'

/**
 * Saves finished games to 対局記録 (IndexedDB). `save` may be called again for
 * the same game (same id = update); only the latest call's status is shown.
 */
export function useRecordSaver() {
  const [status, setStatus] = useState<SaveStatus | null>(null)
  const latest = useRef<GameInput | null>(null)

  const save = useCallback((input: GameInput) => {
    latest.current = input
    setStatus(null)
    void saveGameRecord(input).then((result) => {
      if (latest.current === input) setStatus(result)
    })
  }, [])

  const retry = useCallback(() => {
    if (latest.current) save(latest.current)
  }, [save])

  /** A new game: forget the previous one's status. */
  const reset = useCallback(() => {
    latest.current = null
    setStatus(null)
  }, [])

  return { status, save, retry, reset }
}
