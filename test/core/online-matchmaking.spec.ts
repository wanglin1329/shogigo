// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CLOSE_SUPERSEDED, Matchmaker, queuePath, secondsUntilBot } from '../../src/games/shogi/online/matchmaking'
import type { SeekOptions } from '../../src/games/shogi/online/matchmaking'
import { systemClock } from '../../src/games/shogi/online/store'
import { FakeSocket, FakeVisibility } from './online-fakes'

const OPTIONS: SeekOptions = { uid: 'user-0001', name: 'Alice', botFallback: true, hideRank: false }
const NOW = Date.parse('2026-09-27T10:00:00Z')

function setup(options = OPTIONS) {
  const visibility = new FakeVisibility()
  const mm = new Matchmaker({
    clock: systemClock,
    createSocket: (url) => new FakeSocket(url),
    wsUrl: (path) => `wss://test${path}`,
    visibility,
  })
  mm.seek(options)
  return { mm, visibility, socket: () => FakeSocket.last() }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  FakeSocket.reset()
})
afterEach(() => vi.useRealTimers())

describe('matchmaking queue', () => {
  it('builds the queue URL from the options', () => {
    expect(queuePath(OPTIONS)).toBe('/api/match/ws?uid=user-0001&name=Alice')
    expect(queuePath({ ...OPTIONS, name: null, botFallback: false, hideRank: true })).toBe('/api/match/ws?uid=user-0001&bot=0&hr=1')
  })

  it('counts down to the server’s botAt, corrected by server_now', () => {
    const { mm, socket } = setup()
    socket().open()
    // Server clock is 5 s ahead; it offers a COM 30 s after queueing.
    socket().receive({
      type: 'queued',
      playing: 4,
      botAt: new Date(NOW + 35_000).toISOString(),
      server_now: new Date(NOW + 5_000).toISOString(),
    })
    const state = mm.get()
    expect(state).toMatchObject({ phase: 'seeking', playing: 4, botAt: NOW + 30_000 })
    expect(secondsUntilBot(state, NOW)).toBe(30)
    expect(secondsUntilBot(state, NOW + 40_000)).toBe(0) // 「まもなく…」: still waiting for the server
    expect(mm.get().phase).toBe('seeking')
  })

  it('has no countdown when the COM fallback is off', () => {
    const { mm, socket } = setup({ ...OPTIONS, botFallback: false })
    socket().receive({ type: 'queued', playing: 0, botAt: null })
    expect(secondsUntilBot(mm.get(), NOW)).toBeNull()
  })

  it('reports a match and closes the queue socket', () => {
    const { mm, socket } = setup()
    const s = socket()
    s.receive({ type: 'matched', room_code: 'ROOMCODE22', token: 't', yourSide: 'gote', opponentName: 'Bob', opponentRank: 5 })
    expect(mm.get()).toMatchObject({ phase: 'found', roomCode: 'ROOMCODE22', token: 't', yourSide: 'gote', opponentName: 'Bob', opponentRank: 5, at: NOW })
    expect(s.closedByClient).toBe(true)
  })

  it('hands over the COM ticket', () => {
    const { mm, socket } = setup()
    socket().receive({ type: 'bot', ticket: 'signed' })
    expect(mm.get()).toEqual({ phase: 'bot', ticket: 'signed' })
  })

  it('turns server errors into messages', () => {
    const { mm, socket } = setup()
    socket().receive({ type: 'error', error: { code: 'queue_timeout', message: '' } })
    expect(mm.get()).toMatchObject({ phase: 'error', code: 'queue_timeout' })
    expect((mm.get() as { message: string }).message).toContain('相手が見つかりません')
  })

  it('returns quietly to idle when another tab takes over', () => {
    const { mm, socket } = setup()
    socket().serverClose(CLOSE_SUPERSEDED)
    expect(mm.get()).toEqual({ phase: 'idle' })
  })

  it('re-queues when the page comes back after losing the socket in the background', () => {
    const { mm, visibility, socket } = setup()
    visibility.set(false)
    socket().serverClose()
    expect(mm.get().phase).toBe('seeking')
    visibility.set(true)
    expect(FakeSocket.all.length).toBe(2)
    expect(mm.get()).toMatchObject({ phase: 'seeking', botAt: null })
  })

  it('fails when the socket drops while visible', () => {
    const { mm, socket } = setup()
    socket().serverClose()
    expect(mm.get()).toMatchObject({ phase: 'error', code: 'connection_lost' })
  })

  it('cancel closes the socket', () => {
    const { mm, socket } = setup()
    const s = socket()
    mm.cancel()
    expect(s.closedByClient).toBe(true)
    expect(mm.get()).toEqual({ phase: 'idle' })
  })
})
