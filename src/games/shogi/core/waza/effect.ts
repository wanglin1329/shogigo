// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2026 the shogi project contributors

// What to show for a detected waza (docs/PLAN.md §5.3-9): pure decisions,
// so the rules are testable without a DOM.

import type { AnyWazaId, WazaHit, WazaTier } from './types'

/** 派手 / 標準 / 控えめ / なし */
export type WazaFxLevel = 'loud' | 'std' | 'calm' | 'off'

export const WAZA_FX_LEVELS: readonly WazaFxLevel[] = ['loud', 'std', 'calm', 'off']

export function isWazaFxLevel(value: unknown): value is WazaFxLevel {
  return typeof value === 'string' && (WAZA_FX_LEVELS as readonly string[]).includes(value)
}

const HOLD_MS: Record<Exclude<WazaTier, 'none'>, number> = { small: 4000, mid: 5000, big: 6000 }
/** A waza made for the first time ever stays a little longer. */
export const FIRST_TIME_EXTRA_MS = 1500

export interface WazaEffectPlan {
  /** Cut-in band with the name across the board. */
  band: boolean
  /** Rings / frames / line on the board. */
  marks: boolean
  /** The card with the one-line explanation. */
  card: boolean
  holdMs: number
}

/**
 * - loud: band for big and mid every time
 * - std: band for big only, and only the first time in this game
 * - calm: never a band
 * - off: nothing at all
 * Marks and the card show at every level but off. Tier "none" (頭金) never
 * shows on the board — it is only listed in the result.
 */
export function planWazaEffect(
  hit: Pick<WazaHit, 'tier'>,
  level: WazaFxLevel,
  options: { firstInGame: boolean; firstEver: boolean },
): WazaEffectPlan | null {
  if (level === 'off' || hit.tier === 'none') return null
  const band =
    level === 'loud' ? hit.tier === 'big' || hit.tier === 'mid' : level === 'std' ? hit.tier === 'big' && options.firstInGame : false
  return {
    band,
    marks: true,
    card: true,
    holdMs: HOLD_MS[hit.tier] + (options.firstEver ? FIRST_TIME_EXTRA_MS : 0),
  }
}

// ---------------------------------------------------------------- lifetime "first time" book

/** id → the day (YYYY-MM-DD) the player first made it. */
export type WazaBook = Partial<Record<AnyWazaId, string>>

/** Records `id` if new. Returns whether this was the first time ever, and the updated book. */
export function noteWaza(book: WazaBook, id: AnyWazaId, today: string): { firstEver: boolean; book: WazaBook } {
  if (book[id]) return { firstEver: false, book }
  return { firstEver: true, book: { ...book, [id]: today } }
}

/** Keeps only well-formed entries from stored data. */
export function sanitizeBook(raw: unknown): WazaBook {
  if (!raw || typeof raw !== 'object') return {}
  const out: WazaBook = {}
  for (const [id, day] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)) out[id as AnyWazaId] = day
  }
  return out
}

/** Whether `hit` is the first of its id (for that player) in this game. */
export function firstInGame(hits: readonly WazaHit[], hit: WazaHit): boolean {
  return !hits.some((h) => h.id === hit.id && h.player === hit.player && h.ply < hit.ply)
}
