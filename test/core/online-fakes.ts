// SPDX-License-Identifier: GPL-3.0-only

// Fakes for the online client tests (Node, no DOM).

import { createGameState } from '../../src/games/shogi/core/kifu/sfen'
import { replayUsiMoves } from '../../src/games/shogi/core/kifu/replay'
import { toPublicState } from '../../src/games/shogi/server/protocol'
import type { MatchPayload } from '../../src/games/shogi/server/protocol'
import type { SocketLike, Visibility } from '../../src/games/shogi/online/store'

export class FakeSocket implements SocketLike {
  static all: FakeSocket[] = []
  readyState = 0
  sent: string[] = []
  onopen: ((event: unknown) => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: ((event: { code?: number }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  closedByClient = false

  constructor(readonly url: string) {
    FakeSocket.all.push(this)
  }

  static reset() {
    FakeSocket.all = []
  }

  static last(): FakeSocket {
    return FakeSocket.all[FakeSocket.all.length - 1]
  }

  send(data: string) {
    if (this.readyState !== 1) throw new Error('not open')
    this.sent.push(data)
  }

  close() {
    if (this.readyState === 3) return
    this.closedByClient = true
    this.readyState = 3
    this.onclose?.({ code: 1000 })
  }

  // --- driven by the test ---
  open() {
    this.readyState = 1
    this.onopen?.({})
  }

  receive(message: unknown) {
    this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) })
  }

  serverClose(code = 1006) {
    this.readyState = 3
    this.onclose?.({ code })
  }

  sentJson(): Record<string, unknown>[] {
    return this.sent.filter((s) => s !== 'ping').map((s) => JSON.parse(s))
  }
}

export class FakeVisibility implements Visibility {
  visible = true
  private listeners = new Set<() => void>()
  isVisible = () => this.visible
  onChange = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  set(visible: boolean) {
    this.visible = visible
    for (const l of this.listeners) l()
  }
}

/** In-memory localStorage installed on globalThis. */
export function installLocalStorage(): Map<string, string> {
  const map = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  }
  return map
}

export function uninstallLocalStorage() {
  delete (globalThis as { localStorage?: unknown }).localStorage
}

/** A server match after `moves` from the standard position. */
export function makeMatch(overrides: Partial<MatchPayload> = {}, moves: string[] = []): MatchPayload {
  const state = moves.length ? replayUsiMoves(null, moves).state : createGameState(null)
  const now = new Date(Date.now()).toISOString()
  return {
    room_code: 'ABCDEFGH',
    created_at: now,
    started_at: now,
    ended_at: null,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    sente_joined: true,
    gote_joined: true,
    sente_name: 'Alice',
    gote_name: 'Bob',
    state: toPublicState(state),
    revision: moves.length,
    game_over: false,
    winner: null,
    result_reason: null,
    disconnect_side: null,
    disconnect_deadline: null,
    side_pref: 'sente',
    match_type: 'invite',
    tc_type: 'none',
    tc_seconds: 0,
    sente_time_ms: null,
    gote_time_ms: null,
    turn_deadline: null,
    server_now: now,
    sente_rank: null,
    gote_rank: null,
    sente_rank_visible: false,
    gote_rank_visible: false,
    sente_rating: null,
    gote_rating: null,
    sente_rating_delta: null,
    gote_rating_delta: null,
    sente_promoted: null,
    gote_promoted: null,
    ...overrides,
  }
}

/** Let pending promise callbacks run (with fake timers active). */
export async function flush(times = 5) {
  for (let i = 0; i < times; i++) await Promise.resolve()
}
