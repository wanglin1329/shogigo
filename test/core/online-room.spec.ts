// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Move } from '../../src/games/shogi/core/engine'
import {
  MOVE_ACK_TIMEOUT_MS,
  POLL_INTERVAL_MS,
  RoomConnection,
  START_TIMEOUT_MS,
  WS_CONNECT_TIMEOUT_MS,
  WS_PING_INTERVAL_MS,
  WS_PONG_TIMEOUT_MS,
  isOlderMatch,
} from '../../src/games/shogi/online/room'
import type { RoomDeps } from '../../src/games/shogi/online/room'
import { systemClock } from '../../src/games/shogi/online/store'
import { FakeSocket, FakeVisibility, flush, makeMatch } from './online-fakes'

const P76: Move = { type: 'move', fromX: 2, fromY: 6, toX: 2, toY: 5, promote: false }
const NO_DC = { side: null, deadline: null }

function setup(options: { startTimeoutMs?: number | null } = {}) {
  const visibility = new FakeVisibility()
  const api = {
    getRoomState: vi.fn(async () => ({ ok: true as const, match: makeMatch(), yourSide: 'sente' as const, disconnect: NO_DC })),
    postMove: vi.fn(),
    postResign: vi.fn(),
  }
  const deps: Partial<RoomDeps> = {
    clock: systemClock,
    createSocket: (url) => new FakeSocket(url),
    wsUrl: (path) => `wss://test${path}`,
    visibility,
    api: api as unknown as RoomDeps['api'],
  }
  const room = new RoomConnection('ABCDEFGH', 'tok', { deps, startTimeoutMs: options.startTimeoutMs })
  room.start()
  return { room, api, visibility, socket: () => FakeSocket.last() }
}

function state(match = makeMatch()) {
  return { type: 'state', match, disconnect: NO_DC, yourSide: 'sente' }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(Date.parse('2026-09-27T10:00:00Z'))
  FakeSocket.reset()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('RoomConnection socket', () => {
  it('connects with the token and applies the pushed state', () => {
    const { room, socket } = setup()
    expect(socket().url).toBe('wss://test/api/rooms/ABCDEFGH/ws?token=tok')
    expect(room.get().connection).toBe('connecting')
    socket().open()
    socket().receive(state())
    const snap = room.get()
    expect(snap.connection).toBe('open')
    expect(snap.yourSide).toBe('sente')
    expect(snap.match?.room_code).toBe('ABCDEFGH')
    expect(snap.position?.currentPlayer).toBe('sente')
    expect(snap.positionMismatch).toBe(false)
  })

  it('pings every 5 s and reconnects after 12 s without pong', () => {
    const { socket } = setup()
    const first = socket()
    first.open()
    vi.advanceTimersByTime(WS_PING_INTERVAL_MS)
    expect(first.sent).toContain('ping')
    first.receive('pong')
    vi.advanceTimersByTime(WS_PONG_TIMEOUT_MS + WS_PING_INTERVAL_MS)
    expect(first.closedByClient).toBe(true)
    vi.advanceTimersByTime(1_000) // first backoff
    expect(FakeSocket.all.length).toBe(2)
  })

  it('falls back to polling after two failures and stops once the socket opens', async () => {
    const { room, api, socket } = setup()
    socket().serverClose()
    vi.advanceTimersByTime(1_000)
    socket().serverClose()
    expect(room.get().connection).toBe('polling')
    await flush()
    expect(api.getRoomState).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(POLL_INTERVAL_MS)
    await flush()
    expect(api.getRoomState).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(2_000) // second backoff → reconnect
    socket().open()
    expect(room.get().connection).toBe('open')
    vi.advanceTimersByTime(POLL_INTERVAL_MS * 3)
    await flush()
    expect(api.getRoomState).toHaveBeenCalledTimes(2)
  })

  it('does not wait for a socket that never opens', async () => {
    const { room, api } = setup()
    vi.advanceTimersByTime(WS_CONNECT_TIMEOUT_MS)
    expect(room.get().connection).toBe('polling')
    await flush()
    expect(api.getRoomState).toHaveBeenCalled()
  })

  it('ignores older states', () => {
    const { room, socket } = setup()
    socket().open()
    socket().receive(state(makeMatch({}, ['7g7f'])))
    socket().receive(state(makeMatch()))
    expect(room.get().match?.revision).toBe(1)
    expect(isOlderMatch(makeMatch({ revision: 1, server_now: '2026-01-01T00:00:00Z' }), makeMatch({ revision: 1, server_now: '2026-01-02T00:00:00Z' }))).toBe(true)
  })

  it('reconnects immediately when the page becomes visible again', () => {
    const { visibility, socket } = setup()
    socket().open()
    visibility.set(false)
    socket().serverClose()
    const count = FakeSocket.all.length
    visibility.set(true)
    expect(FakeSocket.all.length).toBe(count + 1)
  })

  it('leaves the room on expiry and ignores later messages', () => {
    const { room, socket } = setup()
    const s = socket()
    s.open()
    s.receive({ type: 'expired' })
    expect(room.get().expired).toBe(true)
    expect(room.get().connection).toBe('closed')
    s.receive(state())
    expect(room.get().match).toBeNull()
  })

  it('fails a matchmaking room that never sends a state', () => {
    const { room } = setup({ startTimeoutMs: START_TIMEOUT_MS })
    vi.advanceTimersByTime(START_TIMEOUT_MS)
    expect(room.get().error?.code).toBe('connect_failed')
    expect(room.get().connection).toBe('closed')
  })

  it('still times out after an effect replay (leave() then start() again)', () => {
    const { room } = setup({ startTimeoutMs: START_TIMEOUT_MS })
    room.leave() // React StrictMode cleanup
    room.start() // …and replay
    vi.advanceTimersByTime(START_TIMEOUT_MS)
    expect(room.get().error?.code).toBe('connect_failed')
  })
})

describe('RoomConnection moves', () => {
  it('shows the move at once and confirms it from the ack', async () => {
    const { room, socket } = setup()
    socket().open()
    socket().receive(state())
    const sent = room.sendMove(P76)
    expect(room.get().pendingMove).toEqual(P76)
    expect(room.get().position?.currentPlayer).toBe('gote')
    const msg = socket().sentJson()[0]
    expect(msg).toMatchObject({ type: 'move', expectedRevision: 0, move: P76 })
    socket().receive({ type: 'ack', reqId: msg.reqId, ok: true, match: makeMatch({}, ['7g7f']) })
    expect(await sent).toBe(true)
    expect(room.get().pendingMove).toBeNull()
    expect(room.get().match?.revision).toBe(1)
    expect(room.get().position?.usiMoveHistory).toEqual(['7g7f'])
  })

  it('says 送信中 only after a second without an answer', async () => {
    const { room, socket } = setup()
    socket().open()
    socket().receive(state())
    void room.sendMove(P76)
    vi.advanceTimersByTime(999)
    expect(room.get().sending).toBe(false)
    vi.advanceTimersByTime(1)
    expect(room.get().sending).toBe(true)
  })

  it('retries over HTTP when the ack does not come; a revision conflict is silent', async () => {
    const { room, api, socket } = setup()
    socket().open()
    socket().receive(state())
    api.postMove.mockResolvedValue({
      ok: false,
      error: { code: 'revision_conflict', message: '' },
      match: makeMatch({}, ['7g7f']),
    })
    const sent = room.sendMove(P76)
    vi.advanceTimersByTime(MOVE_ACK_TIMEOUT_MS)
    expect(await sent).toBe(false)
    expect(api.postMove).toHaveBeenCalledWith('ABCDEFGH', 'tok', { expectedRevision: 0, move: P76 })
    expect(room.get().match?.revision).toBe(1) // the move had landed
    expect(room.get().error).toBeNull()
    expect(room.get().pendingMove).toBeNull()
  })

  it('rolls back a refused move and reports it', async () => {
    const { room, api, socket } = setup()
    socket().serverClose() // no socket: straight to HTTP
    api.postMove.mockResolvedValue({ ok: false, error: { code: 'illegal_move', message: '' } })
    api.getRoomState.mockResolvedValue({ ok: true, match: makeMatch(), yourSide: 'sente', disconnect: NO_DC })
    await flush()
    // seed a match through polling-free path
    ;(room as unknown as { applyMatch: (m: unknown) => void }).applyMatch(makeMatch())
    expect(await room.sendMove(P76)).toBe(false)
    expect(room.get().position?.currentPlayer).toBe('sente')
    expect(room.get().error?.code).toBe('illegal_move')
  })

  it('drops answers that arrive after leaving', async () => {
    const { room, api, socket } = setup()
    socket().serverClose()
    ;(room as unknown as { applyMatch: (m: unknown) => void }).applyMatch(makeMatch())
    let answer: (v: unknown) => void = () => {}
    api.postMove.mockReturnValue(new Promise((r) => (answer = r)))
    const sent = room.sendMove(P76)
    room.leave()
    answer({ ok: true, match: makeMatch({}, ['7g7f']) })
    expect(await sent).toBe(false)
    expect(room.get().match?.revision).toBe(0)
  })
})
