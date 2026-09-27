// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2025~ Yuki Lab
// Copyright 2026 the shogi project contributors
// Modified 2026-09-27: our own database name ('sg-records'); saving is an upsert
// by game id (the decision is made by core/records/model.ts planSave, the
// summaries subtract the old version); tsume, backup/restore and the recording
// start-time gate dropped. Never touches IndexedDB at import time.

import {
  RECORD_MODES,
  emptySummary,
  modeGroup,
  normalizeGame,
  planSave,
  updateSummary,
} from '../core/records/model'
import type {
  GameCursor,
  GameInput,
  GameRecord,
  GamesPage,
  GamesQuery,
  RecordMode,
  SaveStatus,
  Summary,
} from '../core/records/types'

const DB_NAME = 'sg-records'
const DB_VERSION = 1

interface StoredGame extends GameRecord {
  modeGroup: Exclude<RecordMode, 'all'>
}

interface WazaReference {
  wazaId: string
  modeGroup: Exclude<RecordMode, 'all'>
  endedAt: number
  id: string
}

let databasePromise: Promise<IDBDatabase> | null = null

export function recordsAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}

function database(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    if (!recordsAvailable()) {
      reject(new Error('Records storage is unavailable'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    let rejected = false
    request.onupgradeneeded = () => {
      const db = request.result
      const games = db.createObjectStore('games', { keyPath: 'id' })
      games.createIndex('byEndedAt', ['endedAt', 'id'])
      games.createIndex('byMode', ['modeGroup', 'endedAt', 'id'])
      const waza = db.createObjectStore('gameWaza', { keyPath: ['wazaId', 'endedAt', 'id'] })
      waza.createIndex('byMode', ['wazaId', 'modeGroup', 'endedAt', 'id'])
      // Updating a game must find and drop its previous waza references.
      waza.createIndex('byGame', 'id')
      db.createObjectStore('summaries', { keyPath: 'mode' })
    }
    request.onerror = () => reject(request.error || new Error('Could not open records storage'))
    request.onblocked = () => {
      rejected = true
      reject(new Error('Records storage is being upgraded in another tab'))
    }
    request.onsuccess = () => {
      const db = request.result
      if (rejected) {
        db.close()
        return
      }
      const release = () => {
        db.close()
        if (databasePromise === pending) databasePromise = null
      }
      db.onversionchange = release
      db.onclose = release
      resolve(db)
    }
  })
  databasePromise = pending
  void pending.catch(() => {
    if (databasePromise === pending) databasePromise = null
  })
  return pending
}

function completed<T>(transaction: IDBTransaction, result: () => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    transaction.oncomplete = () => resolve(result())
    transaction.onabort = () => reject(transaction.error || new Error('Could not save records'))
    transaction.onerror = () => {} // the abort handler reports it
  })
}

function withoutGroup(stored: StoredGame): GameRecord {
  const { modeGroup: _group, ...game } = stored
  return game
}

/**
 * Saves a finished game: the game, its waza references and every affected
 * summary in one transaction. Saving the same id again replaces the record and
 * moves the summaries from the old version to the new one.
 */
export async function saveGame(input: GameInput): Promise<SaveStatus> {
  if (!recordsAvailable()) return { status: 'unavailable' }
  let game: GameRecord
  try {
    game = normalizeGame(input)
  } catch (error) {
    return { status: 'failed', message: error instanceof Error ? error.message : String(error) }
  }
  try {
    const db = await database()
    const transaction = db.transaction(['games', 'gameWaza', 'summaries'], 'readwrite')
    const games = transaction.objectStore('games')
    const references = transaction.objectStore('gameWaza')
    const summaries = transaction.objectStore('summaries')
    let outcome: 'saved' | 'updated' | 'unchanged' = 'saved'
    const done = completed(transaction, () => outcome)
    const existing = games.get(game.id)
    existing.onsuccess = () => {
      const previous = existing.result ? withoutGroup(existing.result as StoredGame) : null
      const plan = planSave(previous, game)
      outcome = plan.outcome
      if (plan.outcome === 'unchanged') return
      const group = modeGroup(game.mode)
      games.put({ ...game, modeGroup: group } satisfies StoredGame)
      const oldRefs = references.index('byGame').getAllKeys(game.id)
      oldRefs.onsuccess = () => {
        for (const key of oldRefs.result) references.delete(key)
        for (const wazaId of game.wazaIds) {
          references.put({ wazaId, modeGroup: group, endedAt: game.endedAt, id: game.id } satisfies WazaReference)
        }
      }
      for (const mode of plan.modes) {
        const request = summaries.get(mode)
        request.onsuccess = () => {
          const { mode: _mode, ...current } = (request.result as (Summary & { mode: RecordMode }) | undefined) ?? {
            mode,
            ...emptySummary(),
          }
          summaries.put({ mode, ...updateSummary(current, mode, previous, game) })
        }
      }
    }
    return { status: await done }
  } catch (error) {
    return { status: 'failed', message: error instanceof Error ? error.message : String(error) }
  }
}

function checkMode(mode: RecordMode): void {
  if (!RECORD_MODES.includes(mode)) throw new TypeError('Invalid records mode')
}

export async function getSummary(mode: RecordMode = 'all'): Promise<Summary> {
  checkMode(mode)
  const db = await database()
  const transaction = db.transaction('summaries', 'readonly')
  let result = emptySummary()
  const done = completed(transaction, () => result)
  const request = transaction.objectStore('summaries').get(mode)
  request.onsuccess = () => {
    if (request.result) {
      const { mode: _mode, ...summary } = request.result as Summary & { mode: RecordMode }
      result = summary
    }
  }
  return done
}

function rangeFor(prefix: IDBValidKey[], cursor?: GameCursor | null): IDBKeyRange {
  if (cursor && (!Number.isSafeInteger(cursor.endedAt) || cursor.endedAt < 0 || !cursor.id)) {
    throw new TypeError('Invalid records cursor')
  }
  // Array keys sort after numbers, so [...prefix, []] closes the prefix without a full scan.
  const upper: IDBValidKey[] = cursor ? [...prefix, cursor.endedAt, cursor.id] : [...prefix, []]
  return IDBKeyRange.bound(prefix, upper, false, Boolean(cursor))
}

/** Newest first (end time, then id, so pages are stable); reads at most limit + 1 rows. */
export async function getGames(query: GamesQuery = {}): Promise<GamesPage> {
  const mode = query.mode ?? 'all'
  checkMode(mode)
  const limit = Number.isFinite(query.limit) ? Math.max(1, Math.min(100, Math.floor(query.limit!))) : 20
  const byWaza = Boolean(query.wazaId)
  const prefix: IDBValidKey[] = byWaza ? [query.wazaId!] : []
  if (mode !== 'all') prefix.push(mode)
  const range = rangeFor(prefix, query.cursor)
  const db = await database()
  const transaction = db.transaction(byWaza ? ['games', 'gameWaza'] : ['games'], 'readonly')
  const gamesStore = transaction.objectStore('games')
  let source: IDBIndex | IDBObjectStore
  if (byWaza) {
    const references = transaction.objectStore('gameWaza')
    source = mode === 'all' ? references : references.index('byMode')
  } else {
    source = gamesStore.index(mode === 'all' ? 'byEndedAt' : 'byMode')
  }
  const games: GameRecord[] = []
  let count = 0
  let nextCursor: GameCursor | null = null
  let hasMore = false
  const done = completed(transaction, () => ({ games: games.filter(Boolean), nextCursor: hasMore ? nextCursor : null }))
  const request = source.openCursor(range, 'prev')
  request.onsuccess = () => {
    const cursor = request.result
    if (!cursor) return
    if (count === limit) {
      hasMore = true
      return
    }
    const row = cursor.value as StoredGame | WazaReference
    const index = count++
    nextCursor = { endedAt: row.endedAt, id: row.id }
    if (byWaza) {
      const gameRequest = gamesStore.get(row.id)
      gameRequest.onsuccess = () => {
        if (gameRequest.result) games[index] = withoutGroup(gameRequest.result as StoredGame)
      }
    } else games[index] = withoutGroup(row as StoredGame)
    cursor.continue()
  }
  return done
}
