// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2025~ Yuki Lab
// Copyright 2026 the shogi project contributors
// Modified 2026-09-27: new modes (bot grouped with online), initialSfen, waza as
// plain ids; summaries can also remove a game (sign −1) so that saving the same
// game id again updates instead of double counting; display labels added;
// tsume, backup parsing and the recording start-time gate dropped.

import type { Counts, GameInput, GameMode, GameRecord, RecordMode, Summary } from './types'

export const GAME_MODES: readonly GameMode[] = ['ai', 'board', 'online', 'bot']
export const RECORD_MODES: readonly RecordMode[] = ['all', 'ai', 'online', 'board']

export function emptyCounts(): Counts {
  return { games: 0, wins: 0, losses: 0, draws: 0, eligible: 0 }
}

export function emptySummary(): Summary {
  return { ...emptyCounts(), waza: {} }
}

/** Summary bucket of a game mode (COM fallback games are online games). */
export function modeGroup(mode: GameMode): Exclude<RecordMode, 'all'> {
  return mode === 'bot' ? 'online' : mode
}

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function isPlayer(value: unknown): value is 'sente' | 'gote' {
  return value === 'sente' || value === 'gote'
}

/** A storable record, or a TypeError the caller turns into a failed save. */
export function normalizeGame(input: GameInput): GameRecord {
  if (!validTime(input.startedAt) || !validTime(input.endedAt) || input.endedAt < input.startedAt) {
    throw new TypeError('Invalid game timestamps')
  }
  if (typeof input.id !== 'string' || !input.id || input.id.length > 200 || !GAME_MODES.includes(input.mode)) {
    throw new TypeError('Invalid game identity')
  }
  if ((input.mode !== 'board' && !isPlayer(input.player)) || (input.winner !== null && !isPlayer(input.winner))) {
    throw new TypeError('Invalid game players')
  }
  if (!Array.isArray(input.moves) || !input.moves.every((m) => typeof m === 'string')) {
    throw new TypeError('Invalid game moves')
  }
  const record: GameRecord = {
    id: input.id,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    mode: input.mode,
    player: input.mode === 'board' ? null : input.player,
    winner: input.winner,
    reason: String(input.reason ?? ''),
    initialSfen: typeof input.initialSfen === 'string' && input.initialSfen ? input.initialSfen : null,
    moves: [...input.moves],
    opponentName: String(input.opponentName ?? ''),
    wazaIds: [...new Set((input.wazaIds ?? []).filter((id) => typeof id === 'string' && id))],
  }
  if (input.mode === 'ai' && input.aiLevel) record.aiLevel = input.aiLevel
  if (input.mode === 'online') {
    if (input.opponentRank) record.opponentRank = input.opponentRank
    if (typeof input.opponentRating === 'number' && Number.isFinite(input.opponentRating)) {
      record.opponentRating = input.opponentRating
    }
  }
  return record
}

export function gameCounts(game: GameRecord): Counts {
  const eligible = game.mode !== 'board' && game.winner !== null
  return {
    games: 1,
    wins: Number(eligible && game.winner === game.player),
    losses: Number(eligible && game.winner !== game.player),
    draws: Number(game.winner === null),
    eligible: Number(eligible),
  }
}

function addCounts(current: Counts, added: Counts, sign: 1 | -1): Counts {
  return {
    games: current.games + sign * added.games,
    wins: current.wins + sign * added.wins,
    losses: current.losses + sign * added.losses,
    draws: current.draws + sign * added.draws,
    eligible: current.eligible + sign * added.eligible,
  }
}

function isEmpty(counts: Counts): boolean {
  return counts.games <= 0
}

/** Adds (sign 1) or removes (sign −1) one game from a summary, without rereading other games. */
export function applyGame(summary: Summary, game: GameRecord, sign: 1 | -1): Summary {
  const delta = gameCounts(game)
  const waza: Record<string, Counts> = { ...summary.waza }
  for (const id of game.wazaIds) {
    const previous = Object.hasOwn(waza, id) ? waza[id] : emptyCounts()
    const next = addCounts(previous, delta, sign)
    if (isEmpty(next)) delete waza[id]
    // defineProperty: a waza id such as "__proto__" must stay an own data property.
    else Object.defineProperty(waza, id, { value: next, enumerable: true, writable: true, configurable: true })
  }
  return { ...addCounts(summary, delta, sign), waza }
}

export function inMode(game: GameRecord, mode: RecordMode): boolean {
  return mode === 'all' || modeGroup(game.mode) === mode
}

/** Summary buckets a save touches: 'all' plus the old and new groups. */
export function touchedModes(previous: GameRecord | null, next: GameRecord): RecordMode[] {
  const modes = new Set<RecordMode>(['all', modeGroup(next.mode)])
  if (previous) modes.add(modeGroup(previous.mode))
  return [...modes]
}

/** One bucket after replacing `previous` (if any) with `next`. */
export function updateSummary(summary: Summary, mode: RecordMode, previous: GameRecord | null, next: GameRecord): Summary {
  let result = summary
  if (previous && inMode(previous, mode)) result = applyGame(result, previous, -1)
  if (inMode(next, mode)) result = applyGame(result, next, 1)
  return result
}

export function sameRecord(a: GameRecord, b: GameRecord): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * What saving `next` does given the stored record with the same id: the whole
 * decision is here (pure) so the IndexedDB layer only executes it.
 */
export function planSave(
  previous: GameRecord | null,
  next: GameRecord,
): { outcome: 'saved' | 'updated' | 'unchanged'; modes: RecordMode[] } {
  if (previous && sameRecord(previous, next)) return { outcome: 'unchanged', modes: [] }
  return { outcome: previous ? 'updated' : 'saved', modes: touchedModes(previous, next) }
}

// ---------------------------------------------------------------- labels

const REASON_LABELS: Record<string, string> = {
  checkmate: '詰み',
  sennichite: '千日手',
  perpetual_check: '連続王手の千日手',
  resign: '投了',
  timeout: '時間切れ',
  disconnect: '接続切れ',
}

export function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? '終局'
}

/** 勝ち / 負け / 引き分け — or, on the 将棋盤, which side won. */
export function resultLabel(game: GameRecord): string {
  if (game.winner === null) return '引き分け'
  if (game.mode === 'board') return game.winner === 'sente' ? '先手の勝ち' : '後手の勝ち'
  return game.winner === game.player ? '勝ち' : '負け'
}

export function resultTone(game: GameRecord): 'win' | 'lose' | 'draw' | 'board' {
  if (game.winner === null) return 'draw'
  if (game.mode === 'board') return 'board'
  return game.winner === game.player ? 'win' : 'lose'
}

export function opponentLabel(game: GameRecord): string {
  switch (game.mode) {
    case 'ai':
      return game.aiLevel ? `AI ${game.aiLevel}` : 'AI'
    case 'bot':
      return 'COM'
    case 'board':
      return '将棋盤'
    case 'online': {
      const name = game.opponentName || '匿名プレイヤー'
      return game.opponentRank ? `${name} ${game.opponentRank}` : name
    }
  }
}

/** Win rate in percent (rounded), or null when nothing counts yet. */
export function winRate(counts: Counts): number | null {
  return counts.eligible > 0 ? Math.round((counts.wins / counts.eligible) * 100) : null
}
