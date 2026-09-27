// SPDX-License-Identifier: GPL-3.0-only

// Online clocks are display-only: the server decides timeouts. The client
// shows the mover's time from `turn_deadline` corrected by the clock skew
// measured from `server_now` (docs/research/research-C-online.md §3).

import { useEffect, useState } from 'react'

import type { Player } from '../core/engine'
import type { MatchPayload } from '../server/protocol'

export const CLOCK_TICK_MS = 250

export type ClockLevel = 'normal' | 'warn' | 'danger'

export interface SideClock {
  /** Milliseconds to show (never negative). */
  ms: number
  /** This side's clock is running. */
  running: boolean
  /** Only the running side can be in warn/danger: the waiting side's time does not move. */
  level: ClockLevel
}

export interface ClockReading {
  sente: SideClock
  gote: SideClock
  /** Side whose clock runs, or null when stopped (game over / not timed / not started). */
  active: Player | null
}

type ClockFields = Pick<
  MatchPayload,
  | 'tc_type'
  | 'tc_seconds'
  | 'turn_deadline'
  | 'sente_time_ms'
  | 'gote_time_ms'
  | 'game_over'
  | 'sente_joined'
  | 'gote_joined'
> & { state: { currentPlayer: Player } }

/** Yellow from half the allowance or 60 s, whichever is shorter. */
export function warnThresholdMs(allowanceMs: number): number {
  return Math.min(allowanceMs / 2, 60_000)
}

/** Red from 6 s or 30 % of the allowance, whichever is shorter. */
export function dangerThresholdMs(allowanceMs: number): number {
  return Math.min(6_000, allowanceMs * 0.3)
}

/** m:ss, rounded up so 0:00 means the time is really gone. */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function isTimed(match: Pick<MatchPayload, 'tc_type'>): boolean {
  return match.tc_type === 'total' || match.tc_type === 'per_move'
}

/** Clock skew to add to Date.now() to get the server's clock. */
export function skewFrom(serverNowIso: string | null | undefined, receivedAtMs: number): number {
  const server = serverNowIso ? Date.parse(serverNowIso) : NaN
  return Number.isFinite(server) ? server - receivedAtMs : 0
}

/**
 * What both clocks read at `nowMs` (local). Returns null when the match has
 * no time control or has not started (both seats not yet filled).
 */
export function readClock(match: ClockFields, skewMs: number, nowMs: number): ClockReading | null {
  if (!isTimed(match) || !match.sente_joined || !match.gote_joined) return null
  const allowance = match.tc_seconds * 1000
  const deadline = match.turn_deadline ? Date.parse(match.turn_deadline) : NaN
  const turn = match.state.currentPlayer
  const running = !match.game_over && Number.isFinite(deadline)
  const bank = (side: Player) => (side === 'sente' ? match.sente_time_ms : match.gote_time_ms)

  let activeMs = 0
  if (running) {
    const cap = match.tc_type === 'total' ? (bank(turn) ?? allowance) : allowance
    // During the start buffer the deadline is further away than the allowance: cap it.
    activeMs = Math.min(deadline - (nowMs + skewMs), cap)
  }
  const warn = warnThresholdMs(allowance)
  const danger = dangerThresholdMs(allowance)

  const side = (who: Player): SideClock => {
    const isTurn = running && who === turn
    const raw = isTurn ? activeMs : match.tc_type === 'total' ? (bank(who) ?? 0) : allowance
    const ms = Math.max(0, raw)
    const level: ClockLevel = !isTurn ? 'normal' : ms <= danger ? 'danger' : ms <= warn ? 'warn' : 'normal'
    return { ms, running: isTurn, level }
  }
  return { sente: side('sente'), gote: side('gote'), active: running ? turn : null }
}

/**
 * Re-reads the clock every 250 ms while it runs. `match` may be a server
 * match or the local COM game's payload.
 */
export function useClock(match: ClockFields | null, skewMs: number): ClockReading | null {
  const [now, setNow] = useState(() => Date.now())
  const running = !!match && isTimed(match) && !match.game_over && !!match.turn_deadline
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS)
    return () => clearInterval(timer)
  }, [running, match?.turn_deadline])
  return match ? readClock(match, skewMs, running ? now : Date.now()) : null
}
