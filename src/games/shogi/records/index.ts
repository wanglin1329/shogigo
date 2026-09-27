// SPDX-License-Identifier: GPL-3.0-only

// Entry point the game modes import. It is tiny on purpose: the IndexedDB
// store is loaded with a dynamic import the first time a game is saved, so it
// never weighs on a page's first load, and nothing here runs at import time.

import type { GameInput, SaveStatus } from '../core/records/types'

export type { GameInput, GameRecord, GameMode, RecordMode, SaveStatus, Summary } from '../core/records/types'

/**
 * Saves (or updates, same `id`) a finished game. Never throws; resolves to a
 * status so the UI can show 「再試行」 on `failed`.
 */
export async function saveGameRecord(input: GameInput): Promise<SaveStatus> {
  if (typeof indexedDB === 'undefined') return { status: 'unavailable' }
  try {
    const store = await import('./store')
    return await store.saveGame(input)
  } catch (error) {
    return { status: 'failed', message: error instanceof Error ? error.message : String(error) }
  }
}

/** The store module itself (records page). */
export function loadRecordsStore() {
  return import('./store')
}
