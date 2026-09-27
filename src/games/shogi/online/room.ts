// SPDX-License-Identifier: GPL-3.0-only

// Connection to one online room (docs/research/research-C-online.md §2.5,
// research-E §2.4). Behaviour follows upstream shogi.js:
//   - WebSocket /api/rooms/{code}/ws?token=, 5 s connect timeout,
//     'ping' every 5 s, reconnect when no 'pong' for 12 s;
//   - reconnect backoff 1 s → 15 s; after 2 consecutive failures poll
//     GET /state every 3 s until the socket is back;
//   - moves are optimistic: WS 'move' with a 2 s ack timeout, then the same
//     move over HTTP (expectedRevision makes the retry idempotent);
//   - a match is applied only if it is newer (revision, then server_now);
//   - every async callback checks the connection epoch, so nothing from an
//     old socket or a left room can touch the current state.

import { useEffect, useMemo, useSyncExternalStore } from 'react'

import { applyMove } from '../core/engine'
import type { GameState, Move, Player } from '../core/engine'
import type { ReplayResult } from '../core/kifu/replay'
import type { DisconnectInfo, MatchPayload, ServerWsMessage } from '../server/protocol'
import * as api from './api'
import type { ErrorContext, Failure } from './api'
import { rebuildPosition } from './position'
import {
  SOCKET_CONNECTING,
  SOCKET_OPEN,
  Store,
  browserSocket,
  documentVisibility,
  sameOriginWsUrl,
  systemClock,
} from './store'
import type { Clock, SocketLike, Visibility } from './store'
import { skewFrom } from './clock'

export const WS_CONNECT_TIMEOUT_MS = 5_000
export const WS_PING_INTERVAL_MS = 5_000
export const WS_PONG_TIMEOUT_MS = 12_000
export const WS_MAX_BACKOFF_MS = 15_000
export const WS_FAILS_BEFORE_POLLING = 2
export const POLL_INTERVAL_MS = 3_000
export const MOVE_ACK_TIMEOUT_MS = 2_000
export const RESIGN_ACK_TIMEOUT_MS = 10_000
/** Show 「送信中…」 only when the server is slower than this. */
export const MOVE_SENDING_HINT_MS = 1_000
/** A matchmaking room must deliver its first state within this time. */
export const START_TIMEOUT_MS = 15_000

export type ConnectionStatus = 'connecting' | 'open' | 'polling' | 'closed'

export interface RoomError {
  code: string
  context: ErrorContext
  message: string
}

export interface RoomSnapshot {
  roomCode: string
  match: MatchPayload | null
  yourSide: Player | null
  disconnect: DisconnectInfo
  connection: ConnectionStatus
  /** Add to Date.now() to get server time (for the clocks). */
  skewMs: number
  /** Full position for the board: the pending move applied on top of the server state. */
  position: GameState | null
  /** A move sent and not yet confirmed (shown optimistically). */
  pendingMove: Move | null
  /** The pending move has waited long enough to say 「送信中…」. */
  sending: boolean
  /** Room expired or gone: the UI should leave. */
  expired: boolean
  /** The replayed moves disagree with the server's board (server shown; worth reporting). */
  positionMismatch: boolean
  error: RoomError | null
}

export interface RoomDeps {
  clock: Clock
  createSocket: (url: string) => SocketLike
  wsUrl: (path: string) => string
  visibility: Visibility
  api: Pick<typeof api, 'getRoomState' | 'postMove' | 'postResign'>
}

const defaultDeps = (): RoomDeps => ({
  clock: systemClock,
  createSocket: browserSocket,
  wsUrl: sameOriginWsUrl,
  visibility: documentVisibility,
  api,
})

interface WsWaiter {
  resolve: (msg: Extract<ServerWsMessage, { type: 'ack' }>) => void
  reject: (error: Error) => void
  timer: unknown
}

/** a is an older view of the room than b (revision first; joins/disconnects keep it, so then server_now). */
export function isOlderMatch(a: MatchPayload, b: MatchPayload): boolean {
  if (a.revision !== b.revision) return a.revision < b.revision
  return Date.parse(a.server_now) < Date.parse(b.server_now)
}

function disconnectFrom(match: MatchPayload): DisconnectInfo {
  return { side: match.disconnect_side, deadline: match.disconnect_deadline }
}

const NO_DISCONNECT: DisconnectInfo = { side: null, deadline: null }

export class RoomConnection extends Store<RoomSnapshot> {
  private readonly deps: RoomDeps
  private token: string
  private epoch = 0
  private ws: SocketLike | null = null
  private wsReady = false
  private failures = 0
  private backoffMs = 1_000
  private reconnectTimer: unknown = null
  private connectTimer: unknown = null
  private pingTimer: unknown = null
  private pollTimer: unknown = null
  private startTimer: unknown = null
  private readonly startTimeoutMs: number | null
  private sendingTimer: unknown = null
  private lastPongAt = 0
  private reqCounter = 0
  private waiters = new Map<number, WsWaiter>()
  private replay: ReplayResult | null = null
  private serverPosition: GameState | null = null
  private submitting = false
  private stopVisibility: () => void = () => {}

  constructor(
    roomCode: string,
    token: string,
    options: { deps?: Partial<RoomDeps>; startTimeoutMs?: number | null; initial?: api.RoomEntry | api.RoomState } = {},
  ) {
    super({
      roomCode,
      match: null,
      yourSide: null,
      disconnect: NO_DISCONNECT,
      connection: 'connecting',
      skewMs: 0,
      position: null,
      pendingMove: null,
      sending: false,
      expired: false,
      positionMismatch: false,
      error: null,
    })
    this.deps = { ...defaultDeps(), ...options.deps }
    this.token = token
    if (options.initial) this.applyMatch(options.initial.match, { yourSide: options.initial.yourSide, disconnect: options.initial.disconnect })
    this.startTimeoutMs = options.startTimeoutMs ?? null
  }

  // ------------------------------------------------------------ lifecycle

  start(): void {
    this.stopVisibility = this.deps.visibility.onChange(() => this.onVisibilityChange())
    // Armed on every start: leave() clears it, and React may leave() and start()
    // the same connection again (StrictMode, effect replay).
    if (this.startTimeoutMs && !this.get().match) {
      const epoch = this.epoch
      this.clear('startTimer')
      this.startTimer = this.deps.clock.setTimeout(() => {
        if (epoch !== this.epoch || this.get().match) return
        this.fail('connect_failed', 'connect')
        this.leave()
      }, this.startTimeoutMs)
    }
    this.connect()
  }

  /** Stops everything; late answers from this room are ignored from now on. */
  leave(): void {
    this.epoch++
    this.stopVisibility()
    this.stopSocket()
    this.stopPolling()
    this.clear('startTimer')
    this.clear('sendingTimer')
    this.set({ connection: 'closed', pendingMove: null, sending: false })
  }

  /** The server re-issued the seat token (e.g. after a settings change): reconnect with it. */
  setToken(token: string): void {
    if (token === this.token) return
    this.token = token
    this.backoffMs = 1_000
    this.connect()
  }

  // ------------------------------------------------------------ socket

  private connect(): void {
    const epoch = this.epoch
    this.stopSocket()
    const { roomCode } = this.get()
    let ws: SocketLike
    try {
      ws = this.deps.createSocket(
        this.deps.wsUrl(`${api.API_BASE}/rooms/${encodeURIComponent(roomCode)}/ws?token=${encodeURIComponent(this.token)}`),
      )
    } catch {
      this.onSocketFailure(epoch)
      return
    }
    this.ws = ws
    if (this.get().connection !== 'polling') this.set({ connection: 'connecting' })

    // A socket that neither opens nor closes is not waited for: start polling, then retry.
    this.connectTimer = this.deps.clock.setTimeout(() => {
      if (this.ws !== ws || ws.readyState !== SOCKET_CONNECTING) return
      this.startPolling()
      this.abandonSocket()
    }, WS_CONNECT_TIMEOUT_MS)

    ws.onopen = () => {
      this.clear('connectTimer')
      if (epoch !== this.epoch || this.ws !== ws) return
      this.wsReady = true
      this.failures = 0
      this.backoffMs = 1_000
      this.stopPolling()
      this.set({ connection: 'open' })
      this.startPing()
    }
    ws.onmessage = (event) => {
      if (epoch !== this.epoch || this.ws !== ws) return
      if (event.data === 'pong') {
        this.lastPongAt = this.deps.clock.now()
        return
      }
      if (typeof event.data !== 'string') return
      let msg: ServerWsMessage
      try {
        msg = JSON.parse(event.data) as ServerWsMessage
      } catch {
        return
      }
      this.onServerMessage(msg)
    }
    ws.onclose = () => {
      this.clear('connectTimer')
      if (this.ws !== ws) return // replaced or closed on purpose
      this.ws = null
      this.wsReady = false
      this.stopPing()
      this.rejectWaiters('ws_closed')
      this.onSocketFailure(epoch)
    }
    ws.onerror = () => {} // onclose follows
  }

  private onServerMessage(msg: ServerWsMessage): void {
    if (msg.type === 'state') {
      this.applyMatch(msg.match, { yourSide: msg.yourSide, disconnect: msg.disconnect })
    } else if (msg.type === 'ack') {
      const waiter = this.waiters.get(msg.reqId)
      if (waiter) {
        this.waiters.delete(msg.reqId)
        this.deps.clock.clearTimeout(waiter.timer)
        waiter.resolve(msg)
      }
    } else if (msg.type === 'expired') {
      this.expire()
    }
  }

  private startPing(): void {
    this.stopPing()
    this.lastPongAt = this.deps.clock.now()
    this.pingTimer = this.deps.clock.setInterval(() => {
      const ws = this.ws
      if (!ws || ws.readyState !== SOCKET_OPEN) return
      if (this.deps.clock.now() - this.lastPongAt > WS_PONG_TIMEOUT_MS) {
        this.abandonSocket() // silently dead
        return
      }
      try {
        ws.send('ping')
      } catch {
        // the close handler takes over
      }
    }, WS_PING_INTERVAL_MS)
  }

  private stopPing(): void {
    if (this.pingTimer !== null) this.deps.clock.clearInterval(this.pingTimer)
    this.pingTimer = null
  }

  /** Give up on the current socket without waiting for its (late) close event. */
  private abandonSocket(): void {
    const ws = this.ws
    if (!ws) return
    this.ws = null
    this.wsReady = false
    this.stopPing()
    this.rejectWaiters('ws_closed')
    try {
      ws.close()
    } catch {
      // ignore
    }
    this.onSocketFailure(this.epoch)
  }

  private stopSocket(): void {
    this.clear('reconnectTimer')
    this.clear('connectTimer')
    this.stopPing()
    const ws = this.ws
    this.ws = null
    this.wsReady = false
    this.rejectWaiters('ws_closed')
    if (ws) {
      try {
        ws.close()
      } catch {
        // ignore
      }
    }
  }

  private onSocketFailure(epoch: number): void {
    if (epoch !== this.epoch || this.get().expired || this.get().match?.game_over) return
    if (this.reconnectTimer !== null) return
    this.failures++
    if (this.failures >= WS_FAILS_BEFORE_POLLING) this.startPolling()
    const delay = this.backoffMs
    this.backoffMs = Math.min(delay * 2, WS_MAX_BACKOFF_MS)
    this.reconnectTimer = this.deps.clock.setTimeout(() => {
      this.reconnectTimer = null
      if (epoch !== this.epoch) return
      this.connect()
    }, delay)
  }

  private onVisibilityChange(): void {
    if (!this.deps.visibility.isVisible()) return
    const { expired, match, connection } = this.get()
    if (expired || match?.game_over || connection === 'closed') return
    const ws = this.ws
    if (ws && (ws.readyState === SOCKET_OPEN || ws.readyState === SOCKET_CONNECTING)) return
    // Mobile browsers drop sockets in the background: reconnect right away.
    this.clear('reconnectTimer')
    this.backoffMs = 1_000
    this.connect()
  }

  // ------------------------------------------------------------ polling

  private startPolling(): void {
    if (this.pollTimer !== null) return
    const epoch = this.epoch
    this.set({ connection: 'polling' })
    this.pollTimer = this.deps.clock.setInterval(() => void this.pollOnce(epoch), POLL_INTERVAL_MS)
    void this.pollOnce(epoch)
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) this.deps.clock.clearInterval(this.pollTimer)
    this.pollTimer = null
  }

  private async pollOnce(epoch: number): Promise<void> {
    if (epoch !== this.epoch) return
    if (this.get().match?.game_over) {
      this.stopPolling()
      return
    }
    const res = await this.deps.api.getRoomState(this.get().roomCode, this.token)
    if (epoch !== this.epoch) return
    if (res.ok) this.applyMatch(res.match, { yourSide: res.yourSide, disconnect: res.disconnect })
    else if (res.error.code === 'not_found') this.expire()
    // other errors: temporary, keep polling
  }

  // ------------------------------------------------------------ state

  private applyMatch(match: MatchPayload, extra: { yourSide?: Player | null; disconnect?: DisconnectInfo | null } = {}): void {
    const current = this.get().match
    if (match.room_code !== this.get().roomCode) return
    if (current && isOlderMatch(match, current)) return
    this.clear('startTimer')

    const revisionChanged = !current || current.revision !== match.revision
    let position = this.serverPosition
    let mismatch = this.get().positionMismatch
    if (revisionChanged || !position) {
      const rebuilt = rebuildPosition(match.state, this.replay)
      this.replay = rebuilt.replay
      this.serverPosition = rebuilt.state
      position = rebuilt.state
      mismatch = rebuilt.mismatch
    }
    // A newer server state replaces any optimistic move (it either contains it or rejected it).
    const pending = revisionChanged ? null : this.get().pendingMove
    if (!pending) this.clear('sendingTimer')
    if (match.game_over) this.stopPolling()

    this.set({
      match,
      yourSide: extra.yourSide ?? this.get().yourSide,
      disconnect: match.game_over ? NO_DISCONNECT : (extra.disconnect ?? disconnectFrom(match)),
      skewMs: skewFrom(match.server_now, this.deps.clock.now()),
      position: pending ? this.withMove(position, pending) : position,
      pendingMove: pending,
      sending: pending ? this.get().sending : false,
      positionMismatch: mismatch,
    })
  }

  private withMove(position: GameState | null, move: Move): GameState | null {
    if (!position) return null
    try {
      return applyMove(position, move).state
    } catch {
      return position
    }
  }

  private expire(): void {
    this.set({ expired: true, error: { code: 'not_found', context: 'connect', message: api.errorMessage('not_found', 'connect') } })
    this.leave()
  }

  private fail(code: string, context: ErrorContext): void {
    this.set({ error: { code, context, message: api.errorMessage(code, context) } })
  }

  /** Clears the last error (after the UI showed it). */
  dismissError(): void {
    if (this.get().error) this.set({ error: null })
  }

  // ------------------------------------------------------------ requests

  private wsRequest(payload: { type: 'move'; expectedRevision: number; move: Move } | { type: 'resign'; expectedRevision: number }, timeoutMs: number) {
    return new Promise<Extract<ServerWsMessage, { type: 'ack' }>>((resolve, reject) => {
      const ws = this.ws
      if (!ws || ws.readyState !== SOCKET_OPEN || !this.wsReady) {
        reject(new Error('ws_not_open'))
        return
      }
      const reqId = ++this.reqCounter
      const timer = this.deps.clock.setTimeout(() => {
        this.waiters.delete(reqId)
        reject(new Error('ws_timeout'))
      }, timeoutMs)
      this.waiters.set(reqId, { resolve, reject, timer })
      try {
        ws.send(JSON.stringify({ ...payload, reqId }))
      } catch (error) {
        this.waiters.delete(reqId)
        this.deps.clock.clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private rejectWaiters(reason: string): void {
    for (const waiter of this.waiters.values()) {
      this.deps.clock.clearTimeout(waiter.timer)
      waiter.reject(new Error(reason))
    }
    this.waiters.clear()
  }

  /**
   * Plays `move` optimistically and sends it. Resolves true when the server
   * accepted it; on rejection the board returns to the server's state.
   */
  async sendMove(move: Move): Promise<boolean> {
    const { match, roomCode } = this.get()
    if (!match || match.game_over || this.submitting || this.get().expired) return false
    const epoch = this.epoch
    const expectedRevision = match.revision
    this.submitting = true
    this.set({ pendingMove: move, position: this.withMove(this.serverPosition, move), sending: false, error: null })
    this.sendingTimer = this.deps.clock.setTimeout(() => {
      if (epoch === this.epoch && this.get().pendingMove === move) this.set({ sending: true })
    }, MOVE_SENDING_HINT_MS)

    try {
      let res: Awaited<ReturnType<RoomDeps['api']['postMove']>>
      try {
        res = await this.wsRequest({ type: 'move', expectedRevision, move }, MOVE_ACK_TIMEOUT_MS)
      } catch (error) {
        // A socket that does not answer is probably dead: replace it, then retry over HTTP.
        if (error instanceof Error && error.message === 'ws_timeout') this.abandonSocket()
        if (epoch !== this.epoch) return false
        res = await this.deps.api.postMove(roomCode, this.token, { expectedRevision, move })
      }
      if (epoch !== this.epoch) return false
      if (res.ok) {
        this.applyMatch(res.match)
        this.dropPending(move)
        return true
      }
      return await this.recover(res, epoch, 'move', move)
    } finally {
      this.submitting = false
    }
  }

  /** Resign the game. Resolves true when the server recorded it. */
  async resign(): Promise<boolean> {
    const { match, roomCode } = this.get()
    if (!match || match.game_over || this.submitting) return false
    const epoch = this.epoch
    this.submitting = true
    try {
      let res: Awaited<ReturnType<RoomDeps['api']['postResign']>>
      try {
        res = await this.wsRequest({ type: 'resign', expectedRevision: match.revision }, RESIGN_ACK_TIMEOUT_MS)
      } catch {
        if (epoch !== this.epoch) return false
        res = await this.deps.api.postResign(roomCode, this.token, { expectedRevision: match.revision })
      }
      if (epoch !== this.epoch) return false
      if (res.ok) {
        this.applyMatch(res.match)
        return true
      }
      return await this.recover(res, epoch, 'resign', null)
    } finally {
      this.submitting = false
    }
  }

  /** A request was refused: show the server's truth (from the answer or a fresh /state). */
  private async recover(res: Failure, epoch: number, context: ErrorContext, move: Move | null): Promise<false> {
    if (move) this.dropPending(move)
    if (res.error.code === 'not_found') {
      this.expire()
      return false
    }
    if (res.match) {
      this.applyMatch(res.match, { disconnect: res.disconnect ?? null })
    } else {
      const latest = await this.deps.api.getRoomState(this.get().roomCode, this.token)
      if (epoch !== this.epoch) return false
      if (latest.ok) this.applyMatch(latest.match, { yourSide: latest.yourSide, disconnect: latest.disconnect })
    }
    // A revision conflict usually means our move already landed (the retry of a lost ack):
    // the refreshed state shows it, so there is nothing to tell the player.
    if (res.error.code !== 'revision_conflict') this.fail(res.error.code, context)
    return false
  }

  /** Remove the optimistic move and show the server position again. */
  private dropPending(move: Move): void {
    if (this.get().pendingMove !== move) return
    this.clear('sendingTimer')
    this.set({ pendingMove: null, sending: false, position: this.serverPosition })
  }

  private clear(name: 'reconnectTimer' | 'connectTimer' | 'startTimer' | 'sendingTimer'): void {
    const handle = this[name]
    if (handle !== null) this.deps.clock.clearTimeout(handle)
    this[name] = null
  }
}

/**
 * React binding. `roomCode`/`token` null = no room. `initial` (the create /
 * join / settings answer) shows the room before the socket's first state;
 * `startTimeoutMs` fails the connection when no state arrives in time
 * (matchmaking rooms).
 */
export function useRoomConnection(
  roomCode: string | null,
  token: string | null,
  options: { initial?: api.RoomEntry | api.RoomState; startTimeoutMs?: number | null } = {},
) {
  const connection = useMemo(
    () => (roomCode && token ? new RoomConnection(roomCode, token, { initial: options.initial, startTimeoutMs: options.startTimeoutMs }) : null),
    // A new token for the same room is handled by setToken below, not by a new connection.
    [roomCode],
  )
  useEffect(() => {
    if (!connection) return
    connection.start()
    return () => connection.leave()
  }, [connection])
  useEffect(() => {
    if (connection && token) connection.setToken(token)
  }, [connection, token])

  const snapshot = useSyncExternalStore(
    connection ? connection.subscribe : noopSubscribe,
    connection ? connection.get : nullSnapshot,
    connection ? connection.get : nullSnapshot,
  )
  return {
    ...(snapshot ?? EMPTY),
    sendMove: (move: Move) => connection?.sendMove(move) ?? Promise.resolve(false),
    resign: () => connection?.resign() ?? Promise.resolve(false),
    leave: () => connection?.leave(),
    dismissError: () => connection?.dismissError(),
  }
}

const noopSubscribe = () => () => {}
const nullSnapshot = () => null
const EMPTY: RoomSnapshot = {
  roomCode: '',
  match: null,
  yourSide: null,
  disconnect: NO_DISCONNECT,
  connection: 'closed',
  skewMs: 0,
  position: null,
  pendingMove: null,
  sending: false,
  expired: false,
  positionMismatch: false,
  error: null,
}
