// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applyMove } from '../../src/games/shogi/core/engine'
import { createGameState } from '../../src/games/shogi/core/kifu/sfen'
import { toPublicState } from '../../src/games/shogi/server/protocol'
import * as api from '../../src/games/shogi/online/api'
import {
  ANONYMOUS,
  checkCustomName,
  getOnlineUid,
  loadNameProfile,
  saveNameProfile,
  shownName,
  wireName,
  withHonorific,
} from '../../src/games/shogi/online/identity'
import { rebuildPosition } from '../../src/games/shogi/online/position'
import { isRandomMatchUnlocked, markOnlinePlayed } from '../../src/games/shogi/online/unlock'
import { installLocalStorage, makeMatch, uninstallLocalStorage } from './online-fakes'

let storage: Map<string, string>
beforeEach(() => {
  storage = installLocalStorage()
})
afterEach(() => {
  uninstallLocalStorage()
  vi.unstubAllGlobals()
})

describe('api', () => {
  const respond = (body: unknown, status = 200) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })))

  it('returns the body of a successful call and sends the token', async () => {
    const match = makeMatch()
    respond({ ok: true, match, yourSide: 'gote', disconnect: { side: null, deadline: null } })
    const res = await api.getRoomState('ABCDEFGH', 'tok')
    expect(res.ok && res.yourSide).toBe('gote')
    const [url, init] = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(url).toBe('/api/rooms/ABCDEFGH/state')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('keeps the server’s error code whatever the status', async () => {
    respond({ ok: false, error: { code: 'room_full', message: 'x' } }, 403)
    const res = await api.joinRoom('ABCDEFGH', { uid: 'user-0001', displayName: null })
    expect(res.ok).toBe(false)
    expect(!res.ok && res.error.code).toBe('room_full')
  })

  it('reports unreachable servers and non-JSON answers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    expect(await api.getRoomState('ABCDEFGH', 't')).toMatchObject({ ok: false, error: { code: 'network' } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 502 })))
    expect(await api.getRoomState('ABCDEFGH', 't')).toMatchObject({ ok: false, error: { code: 'http_502' } })
  })

  it('online stats never fail the page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    expect(await api.getOnlineStats('user-0001')).toEqual({ playing: 0 })
  })

  it('reads the online-stats body as the server sends it (no `ok` field)', async () => {
    const rating = { rating: 1500, rank: 4, rankLabel: '5級', tier: 1, progress: 0, pointsToNext: 100, nextLabel: '4級' }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ playing: 2, rating }))))
    expect(await api.getOnlineStats('user-0001')).toEqual({ playing: 2, rating })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ playing: 3 }))))
    expect(await api.getOnlineStats()).toEqual({ playing: 3 })
  })

  it('words errors for where they happened', () => {
    expect(api.errorMessage('not_found', 'join')).toContain('24時間')
    expect(api.errorMessage('not_found', 'move')).toBe('部屋の有効期限が切れました。')
    expect(api.errorMessage('weird', 'resign')).toContain('投了')
  })
})

describe('identity', () => {
  it('creates a uid once and keeps it', () => {
    const uid = getOnlineUid()
    expect(uid).toMatch(/^[0-9a-zA-Z-]{8,64}$/)
    expect(getOnlineUid()).toBe(uid)
  })

  it('recovers the uid from the server cookie when storage was cleared', () => {
    vi.stubGlobal('document', { cookie: 'x=1; __Host-sg_uid=user-recovered-1' })
    expect(getOnlineUid()).toBe('user-recovered-1')
    expect(storage.get('sg.online.uid')).toBe('"user-recovered-1"')
  })

  it('gives newcomers a neutral name and repairs stale saved names', () => {
    const first = loadNameProfile()
    expect(first.mode).toBe('default')
    expect(first.name).toMatch(/^Player\d{4}$/)
    saveNameProfile({ mode: 'generated', name: 'ありえないのなまえ' })
    const repaired = loadNameProfile()
    expect(repaired.mode).toBe('generated')
    expect(repaired.name).not.toBe('ありえないのなまえ')
    expect(repaired.name).toContain('の')
    saveNameProfile({ mode: 'custom', name: '' })
    expect(wireName(loadNameProfile())).toBeNull()
  })

  it('checks custom names (full-width folded, 10 half-width chars max)', () => {
    expect(checkCustomName('Ｂｏｂ_1')).toEqual({ ok: true, name: 'Bob_1' })
    expect(checkCustomName('ぼぶ').ok).toBe(false)
    expect(checkCustomName('abcdefghijk').ok).toBe(false)
  })

  it('adds the honorific the Japanese way', () => {
    expect(withHonorific('Bob')).toBe('Bob さん')
    expect(withHonorific('ふわふわのたぬき')).toBe('ふわふわのたぬきさん')
    expect(withHonorific('COM')).toBe('COM')
    expect(shownName('  ')).toBe(ANONYMOUS)
    expect(withHonorific(null)).toBe(`${ANONYMOUS}さん`)
  })
})

describe('position rebuild', () => {
  it('replays the moves and agrees with the server', () => {
    const match = makeMatch({}, ['7g7f', '3c3d'])
    const rebuilt = rebuildPosition(match.state)
    expect(rebuilt.mismatch).toBe(false)
    expect(rebuilt.state.positionHistory.length).toBe(3)
    // The next update reuses the replay.
    const next = makeMatch({}, ['7g7f', '3c3d', '2g2f'])
    expect(rebuildPosition(next.state, rebuilt.replay).state.usiMoveHistory).toEqual(['7g7f', '3c3d', '2g2f'])
  })

  it('shows the server board when the moves disagree with it', () => {
    const server = toPublicState(applyMove(createGameState(null), { type: 'move', fromX: 2, fromY: 6, toX: 2, toY: 5 }).state)
    const lying = { ...server, usiMoveHistory: ['2g2f'] }
    const rebuilt = rebuildPosition(lying)
    expect(rebuilt.mismatch).toBe(true)
    expect(rebuilt.state.board[5][2]?.type).toBe('FU')
  })
})

describe('random-match unlock', () => {
  it('opens after one AI win or any finished online game', () => {
    expect(isRandomMatchUnlocked()).toBe(false)
    storage.set('sg.shogi.ai.progress', JSON.stringify({ beaten: [], wins: 1, counted: [] }))
    expect(isRandomMatchUnlocked()).toBe(true)
    storage.clear()
    markOnlinePlayed()
    expect(isRandomMatchUnlocked()).toBe(true)
  })
})
