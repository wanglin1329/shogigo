// SPDX-License-Identifier: GPL-3.0-only

// Random matchmaking queue (docs/PLAN.md §6.2, research-C §1.3 / §2.2).
// The server decides everything: who is paired, and when a COM game is
// offered (`botAt`, BOT_FALLBACK_SECONDS). The client only shows a countdown;
// reaching zero shows 「まもなく…」 and keeps waiting for the server's `bot`.

import { useEffect, useMemo, useSyncExternalStore } from 'react'

import type { Player } from '../core/engine'
import type { MatchmakerServerMessage } from '../server/protocol'
import { API_BASE, errorMessage } from './api'
import { Store, browserSocket, documentVisibility, sameOriginWsUrl, systemClock, SOCKET_OPEN } from './store'
import type { Clock, SocketLike, Visibility } from './store'

/** Keepalive on the queue socket (auto-answered by the server without waking the DO). */
export const QUEUE_PING_INTERVAL_MS = 10_000
/** How long the 「見つかりました」 card shows before the room connection is opened. */
export const FOUND_PAUSE_MS = 1_500
/** Close code the server uses when the same uid started seeking elsewhere. */
export const CLOSE_SUPERSEDED = 4000

export interface SeekOptions {
  uid: string
  /** Display name sent to the server (null = anonymous). */
  name: string | null
  /** Offer a COM game when nobody is found (default on). */
  botFallback: boolean
  /** Hide my rank from opponents (and theirs from me). */
  hideRank: boolean
}

export type MatchmakingState =
  | { phase: 'idle' }
  | {
      phase: 'seeking'
      /** Players online, as last reported by the queue. */
      playing: number
      /** Local time (ms) at which the server will offer a COM game; null when the fallback is off. */
      botAt: number | null
      /** Local time the current wait started (for the count-up when botAt is null). */
      since: number
    }
  | {
      phase: 'found'
      roomCode: string
      token: string
      yourSide: Player
      opponentName: string | null
      opponentRank: number | null
      /** Local time the match was found (the UI waits FOUND_PAUSE_MS before entering). */
      at: number
    }
  | { phase: 'bot'; ticket: string | null }
  | { phase: 'error'; code: string; message: string }

export interface MatchmakingDeps {
  clock: Clock
  createSocket: (url: string) => SocketLike
  wsUrl: (path: string) => string
  visibility: Visibility
}

export function queuePath(options: SeekOptions): string {
  const params = new URLSearchParams({ uid: options.uid })
  if (options.name) params.set('name', options.name)
  if (!options.botFallback) params.set('bot', '0')
  if (options.hideRank) params.set('hr', '1')
  return `${API_BASE}/match/ws?${params.toString()}`
}

/** Seconds left until the COM offer (0 = 「まもなく…」), or null when the fallback is off. */
export function secondsUntilBot(state: MatchmakingState, nowMs: number): number | null {
  if (state.phase !== 'seeking' || state.botAt === null) return null
  return Math.max(0, Math.ceil((state.botAt - nowMs) / 1000))
}

export class Matchmaker extends Store<MatchmakingState> {
  private readonly deps: MatchmakingDeps
  private ws: SocketLike | null = null
  private pingTimer: unknown = null
  private options: SeekOptions | null = null
  /** The socket was lost while the page was hidden: re-queue when it is visible again. */
  private lostWhileHidden = false
  private stopVisibility: () => void = () => {}

  constructor(deps: Partial<MatchmakingDeps> = {}) {
    super({ phase: 'idle' })
    this.deps = {
      clock: systemClock,
      createSocket: browserSocket,
      wsUrl: sameOriginWsUrl,
      visibility: documentVisibility,
      ...deps,
    }
  }

  /** Start (or restart) looking for an opponent. */
  seek(options: SeekOptions): void {
    this.options = options
    this.stopVisibility()
    this.stopVisibility = this.deps.visibility.onChange(() => this.onVisibilityChange())
    this.replace({ phase: 'seeking', playing: 0, botAt: null, since: this.deps.clock.now() })
    this.open()
  }

  /** Stop looking. Closing the socket is the cancellation. */
  cancel(): void {
    this.close()
    this.stopVisibility()
    this.replace({ phase: 'idle' })
  }

  /** Back to idle after the caller consumed a found / bot / error state. */
  reset(): void {
    this.cancel()
  }

  dispose(): void {
    this.cancel()
  }

  private open(): void {
    this.close()
    this.lostWhileHidden = false
    const options = this.options
    if (!options) return
    let ws: SocketLike
    try {
      ws = this.deps.createSocket(this.deps.wsUrl(queuePath(options)))
    } catch {
      this.toError('connection_lost')
      return
    }
    this.ws = ws
    ws.onopen = () => {
      if (this.ws !== ws) return
      this.startPing()
    }
    ws.onmessage = (event) => {
      if (this.ws !== ws || typeof event.data !== 'string' || event.data === 'pong') return
      let msg: MatchmakerServerMessage
      try {
        msg = JSON.parse(event.data) as MatchmakerServerMessage
      } catch {
        return
      }
      this.onMessage(msg)
    }
    ws.onclose = (event) => {
      if (this.ws !== ws) return // closed by us, or after matched/bot/error
      this.ws = null
      this.stopPing()
      if (this.get().phase !== 'seeking') return
      if (event?.code === CLOSE_SUPERSEDED) {
        // Seeking started in another tab: this one quietly returns to the lobby.
        this.cancel()
        return
      }
      if (!this.deps.visibility.isVisible()) {
        // Phones drop sockets in the background: keep seeking and re-queue on return.
        this.lostWhileHidden = true
        return
      }
      this.toError('connection_lost')
    }
    ws.onerror = () => {}
  }

  private onMessage(msg: MatchmakerServerMessage & { server_now?: string }): void {
    const state = this.get()
    if (state.phase !== 'seeking') return
    if (msg.type === 'queued') {
      this.replace({
        ...state,
        playing: typeof msg.playing === 'number' ? msg.playing : state.playing,
        botAt: this.toLocalTime(msg.botAt, msg.server_now),
      })
      return
    }
    // Every other message ends the queue; the server closes the socket.
    this.close()
    this.stopVisibility()
    if (msg.type === 'matched') {
      this.replace({
        phase: 'found',
        roomCode: msg.room_code,
        token: msg.token,
        yourSide: msg.yourSide,
        opponentName: msg.opponentName || null,
        opponentRank: typeof msg.opponentRank === 'number' ? msg.opponentRank : null,
        at: this.deps.clock.now(),
      })
    } else if (msg.type === 'bot') {
      this.replace({ phase: 'bot', ticket: typeof msg.ticket === 'string' ? msg.ticket : null })
    } else if (msg.type === 'error') {
      this.toError(msg.error?.code ?? 'unknown')
    }
  }

  /**
   * `botAt` is in server time. With `server_now` in the message the device's
   * clock error is removed; without it the device clock is trusted.
   */
  private toLocalTime(botAt: string | null | undefined, serverNow: string | undefined): number | null {
    if (!botAt) return null
    const at = Date.parse(botAt)
    if (!Number.isFinite(at)) return null
    const server = serverNow ? Date.parse(serverNow) : NaN
    const skew = Number.isFinite(server) ? server - this.deps.clock.now() : 0
    return at - skew
  }

  private toError(code: string): void {
    this.close()
    this.stopVisibility()
    this.replace({ phase: 'error', code, message: errorMessage(code, 'match') })
  }

  private onVisibilityChange(): void {
    if (!this.deps.visibility.isVisible() || !this.lostWhileHidden || this.get().phase !== 'seeking') return
    const ws = this.ws
    if (ws && ws.readyState === SOCKET_OPEN) return
    // The server's wait restarts; it re-sends botAt on the new connection.
    this.replace({ phase: 'seeking', playing: 0, botAt: null, since: this.deps.clock.now() })
    this.open()
  }

  private startPing(): void {
    this.stopPing()
    this.pingTimer = this.deps.clock.setInterval(() => {
      const ws = this.ws
      if (!ws || ws.readyState !== SOCKET_OPEN) return
      try {
        ws.send('ping')
      } catch {
        // onclose follows
      }
    }, QUEUE_PING_INTERVAL_MS)
  }

  private stopPing(): void {
    if (this.pingTimer !== null) this.deps.clock.clearInterval(this.pingTimer)
    this.pingTimer = null
  }

  private close(): void {
    this.stopPing()
    const ws = this.ws
    this.ws = null
    if (ws) {
      try {
        ws.close()
      } catch {
        // ignore
      }
    }
  }
}

/** React binding: one queue per component; closed on unmount. */
export function useMatchmaking() {
  const matchmaker = useMemo(() => new Matchmaker(), [])
  useEffect(() => () => matchmaker.dispose(), [matchmaker])
  const state = useSyncExternalStore(matchmaker.subscribe, matchmaker.get, matchmaker.get)
  return {
    state,
    seek: (options: SeekOptions) => matchmaker.seek(options),
    cancel: () => matchmaker.cancel(),
    reset: () => matchmaker.reset(),
  }
}
