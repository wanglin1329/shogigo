// SPDX-License-Identifier: GPL-3.0-only

import { readJson, writeJson } from '../../../../site/storage'

/** Identity of the game on the board: its 対局記録 id and when it started. */
export interface GameMeta {
  id: string
  startedAt: number
}

export function newGameMeta(): GameMeta {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  return { id, startedAt: Date.now() }
}

/**
 * The saved meta under `key`, or a new one (saved) when missing or broken.
 * `legacyId`: an id saved before the meta existed, kept so the game stays the same game.
 * Call after hydration.
 */
export function loadGameMeta(key: string, legacyId?: string | null): GameMeta {
  const saved = readJson<GameMeta>(key)
  if (saved && typeof saved.id === 'string' && saved.id && Number.isFinite(saved.startedAt)) return saved
  const meta = typeof legacyId === 'string' && legacyId ? { id: legacyId, startedAt: Date.now() } : newGameMeta()
  writeJson(key, meta)
  return meta
}
