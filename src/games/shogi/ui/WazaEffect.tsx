// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2026 the shogi project contributors

// 手筋・囲い・戦法の演出 (docs/PLAN.md §5.3-9). Render it inside the board
// grid through Board's `overlay` prop: every position below is a percentage
// of the 9×9 grid.

import { useEffect, useMemo, useRef, useState } from 'react'

import type { Player } from '../core/engine'
import { firstInGame, noteWaza, planWazaEffect, sanitizeBook } from '../core/waza/effect'
import type { WazaEffectPlan, WazaFxLevel } from '../core/waza/effect'
import { keptWaza, summarizeWaza } from '../core/waza/index'
import type { WazaHit, WazaSummaryEntry } from '../core/waza/index'
import { WazaTracker } from '../core/waza/tracker'
import type { Square } from '../core/waza/types'
import { readJson, writeJson } from '../../../site/storage'
import { WAZA_COPY, WAZA_FIRST_LINE } from './waza-copy'

const BOOK_KEY = 'shogi.waza.book'
/** A tap that moved less than this is a tap (not a drag): it dismisses. */
const TAP_SLOP_PX = 10
/** Stagger between the frames of a castle's pieces. */
const STAGGER_MS = 95

export interface LatestWaza {
  hit: WazaHit
  firstInGame: boolean
}

/**
 * Waza of the game on the board, kept up to date incrementally.
 * - `latest`: the waza made by `owners` with the last move, when the board
 *   shows the end of the game
 * - `lastMover`: who made that last move (null when not at the end)
 * - `isCurrent(hit)`: the hit is still in this game at or before the cursor
 *   (false after stepping back past it, a new game, an import…)
 *   — the three above are what <WazaEffect> needs (pass the whole object)
 * - `keptAt(ply)`: the castle / strategy name to keep showing in the kifu bar
 * - `summary()`: this game's waza by `owners`, in order (result dialog)
 */
export function useWazaDetection({
  initialSfen,
  moves,
  cursor,
  owners,
}: {
  initialSfen: string | null
  moves: readonly string[]
  cursor: number
  owners: readonly Player[]
}) {
  const tracker = useMemo(() => new WazaTracker(), [])
  const scan = useMemo(() => tracker.scan(initialSfen, moves), [tracker, initialSfen, moves])
  const ownersKey = owners.join(',')
  return useMemo(() => {
    const mine = owners.slice()
    const own = (h: WazaHit | undefined) => (h && mine.includes(h.player) ? h : null)
    const atEnd = cursor > 0 && cursor === moves.length
    const last = atEnd ? own(scan.byPly.get(cursor)) : null
    return {
      latest: last ? ({ hit: last, firstInGame: firstInGame(scan.hits, last) } satisfies LatestWaza) : null,
      lastMover: atEnd ? moverOf(initialSfen, cursor) : null,
      isCurrent: (hit: WazaHit): boolean => {
        const at = scan.byPly.get(hit.ply)
        return hit.ply <= cursor && at?.id === hit.id && at.player === hit.player
      },
      keptAt: (ply: number): WazaHit | null => keptWaza(scan, ply, mine),
      summary: (): WazaSummaryEntry[] => summarizeWaza(scan, mine),
    }
    // `owners` is compared by content (callers usually pass a fresh array).
  }, [scan, cursor, moves.length, ownersKey, initialSfen])
}

export type WazaDetection = ReturnType<typeof useWazaDetection>

/** Who made move number `ply` (1-based). */
function moverOf(initialSfen: string | null, ply: number): Player {
  const first: Player = initialSfen?.trim().split(/\s+/)[1] === 'w' ? 'gote' : 'sente'
  return ply % 2 === 1 ? first : first === 'sente' ? 'gote' : 'sente'
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function today(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

interface Shown {
  hit: WazaHit
  plan: WazaEffectPlan
  firstEver: boolean
  key: number
}

export function WazaEffect({
  waza,
  trigger,
  ended,
  flipped,
  level,
}: {
  waza: Pick<WazaDetection, 'latest' | 'lastMover' | 'isCurrent'>
  /**
   * Changes each time a move is actually played (e.g. the board's animation
   * id). The effect only fires on a change — never for a restored game or
   * when stepping through the record.
   */
  trigger: number | null
  /** The game is over: a waza on the last move goes to the result dialog only (it would hide it anyway). */
  ended: boolean
  flipped: boolean
  level: WazaFxLevel
}) {
  const [shown, setShown] = useState<Shown | null>(null)
  const lastTrigger = useRef<number | null>(trigger)
  const { latest, lastMover, isCurrent } = waza

  // A new move: decide what (if anything) to show.
  useEffect(() => {
    if (trigger === null || trigger === lastTrigger.current) return
    lastTrigger.current = trigger
    if (!latest) {
      // The opponent's reply leaves the effect up (the AI answers within a
      // second); the same side moving again without a waza, or the game
      // ending, takes it down.
      setShown((s) => (s && (ended || s.hit.player === lastMover) ? null : s))
      return
    }
    const noted = noteWaza(sanitizeBook(readJson(BOOK_KEY)), latest.hit.id, today())
    const plan = ended ? null : planWazaEffect(latest.hit, level, { firstInGame: latest.firstInGame, firstEver: noted.firstEver })
    // The book records the waza even when the effect is off: "first time" is about the player.
    if (noted.firstEver) writeJson(BOOK_KEY, noted.book)
    setShown(plan ? { hit: latest.hit, plan, firstEver: noted.firstEver, key: trigger } : null)
  }, [trigger, latest, lastMover, ended, level])

  // Stepped back before it, or another game (new game, import, branch): take it down.
  useEffect(() => {
    if (shown && !isCurrent(shown.hit)) setShown(null)
  }, [shown, isCurrent])

  // Ends by itself, on a tap (not a drag) anywhere, or when the layout changes.
  useEffect(() => {
    if (!shown) return
    const end = () => setShown(null)
    const timer = window.setTimeout(end, shown.plan.holdMs)
    let down: { x: number; y: number } | null = null
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY }
    }
    const onUp = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) <= TAP_SLOP_PX) end()
      down = null
    }
    window.addEventListener('pointerdown', onDown, { capture: true })
    window.addEventListener('pointerup', onUp, { capture: true })
    window.addEventListener('resize', end)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointerdown', onDown, { capture: true })
      window.removeEventListener('pointerup', onUp, { capture: true })
      window.removeEventListener('resize', end)
    }
  }, [shown])

  if (!shown) return null
  const { hit, plan } = shown
  const copy = WAZA_COPY[hit.id]
  const screen = (s: Square) => (flipped ? { col: 8 - s.x, row: 8 - s.y } : { col: s.x, row: s.y })
  const cell = (s: Square) => {
    const { col, row } = screen(s)
    return { left: `${(col / 9) * 100}%`, top: `${(row / 9) * 100}%` }
  }
  const center = (s: Square) => {
    const { col, row } = screen(s)
    return { x: col + 0.5, y: row + 0.5 }
  }
  const still = reducedMotion()

  // Tesuji: [move square, ...targets]. Castle: its key squares. Strategy: the moved piece.
  const [origin, ...targets] = hit.squares
  const frames = hit.kind === 'castle' ? hit.squares : targets
  const ring = hit.kind === 'castle' ? null : origin

  return (
    <div className={`waza-layer waza-${hit.tier} ${still ? 'waza-still' : ''}`} key={shown.key} aria-live="polite">
      {plan.marks && (
        <>
          {ring && <span className="waza-ring" style={cell(ring)} aria-hidden="true" />}
          {frames.map((s, i) => (
            <span
              key={`${s.x},${s.y}`}
              className={hit.kind === 'castle' ? 'waza-frame waza-frame-castle' : 'waza-frame'}
              style={{ ...cell(s), animationDelay: still ? '0ms' : `${i * STAGGER_MS}ms` }}
              aria-hidden="true"
            />
          ))}
          {hit.kind === 'tesuji' && ring && targets.length > 0 && (
            <svg className="waza-lines" viewBox="0 0 9 9" aria-hidden="true">
              {targets.map((t) => {
                const a = center(ring)
                const b = center(t)
                return <line key={`${t.x},${t.y}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} pathLength={1} />
              })}
            </svg>
          )}
        </>
      )}
      {plan.band && (
        <div className="waza-band" aria-hidden="true">
          <span className="waza-band-name">{copy.name}</span>
          <span className="waza-band-kana">{copy.kana}</span>
        </div>
      )}
      {plan.card && (
        <div className="waza-card" role="status">
          <span className="waza-card-name">
            {copy.name}
            <span className="waza-card-kind">{hit.kind === 'tesuji' ? '手筋' : hit.kind === 'castle' ? '囲い' : '戦法'}</span>
          </span>
          {shown.firstEver && <span className="waza-card-first">{WAZA_FIRST_LINE}</span>}
          <span className="waza-card-line">{copy.line}</span>
        </div>
      )}
    </div>
  )
}
