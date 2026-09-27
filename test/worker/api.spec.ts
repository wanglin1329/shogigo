// SPDX-License-Identifier: GPL-3.0-only

import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import { signPlayerToken } from '../../src/online/token'

const SECRET = 'test-secret-for-vitest-only'
const BASE = 'https://shogi.test'

function get(path: string, headers: HeadersInit = {}) {
  return exports.default.fetch(new Request(`${BASE}${path}`, { headers }))
}

function upgrade(path: string) {
  return get(path, { Upgrade: 'websocket' })
}

function nextMessage(ws: WebSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no message')), 5000)
    ws.addEventListener('message', (e) => {
      clearTimeout(timer)
      resolve(typeof e.data === 'string' ? e.data : new TextDecoder().decode(e.data))
    }, { once: true })
  })
}

describe('API routing', () => {
  it('health checks D1', async () => {
    const res = await get('/api/health')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ ok: true, d1: true })
  })

  it('unknown /api paths are JSON 404s, not pages', async () => {
    const res = await get('/api/nope')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ ok: false, error: { code: 'not_found' } })
  })

  it('non-API paths fall through to the page handler with no-store by default', async () => {
    const res = await get('/board')
    expect(await res.text()).toBe('tanstack page')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('WebSocket endpoints require an upgrade', async () => {
    expect((await get('/api/match/ws')).status).toBe(426)
    expect((await get('/api/rooms/ABCDEFGH/ws')).status).toBe(426)
  })
})

describe('matchmaking WebSocket', () => {
  it('accepts, reports botAt from the server clock, and answers ping', async () => {
    const before = Date.now()
    const res = await upgrade('/api/match/ws')
    expect(res.status).toBe(101)
    const ws = res.webSocket!
    const firstMessage = nextMessage(ws)
    ws.accept()
    const queued = JSON.parse(await firstMessage)
    expect(queued.type).toBe('queued')
    const waitMs = Date.parse(queued.botAt) - before
    expect(waitMs).toBeGreaterThanOrEqual(30_000)
    expect(waitMs).toBeLessThan(35_000)

    const pong = nextMessage(ws)
    ws.send('ping')
    expect(await pong).toBe('pong')
    ws.close()
  })
})

describe('room WebSocket', () => {
  async function token(roomCode: string, exp = Date.now() + 60_000) {
    return signPlayerToken({ roomCode, side: 'sente', uid: 'user-0001', exp }, SECRET)
  }

  it('rejects a malformed room code', async () => {
    expect((await upgrade('/api/rooms/bad!code/ws?token=x')).status).toBe(400)
    expect((await upgrade('/api/rooms/%E0%A4%A/ws?token=x')).status).toBe(400)
  })

  it('rejects a missing, forged, expired, or other-room token before waking the DO', async () => {
    expect((await upgrade('/api/rooms/ABCDEFGH/ws')).status).toBe(403)
    expect((await upgrade('/api/rooms/ABCDEFGH/ws?token=forged.token')).status).toBe(403)
    const expired = await token('ABCDEFGH', Date.now() - 1)
    expect((await upgrade(`/api/rooms/ABCDEFGH/ws?token=${expired}`)).status).toBe(403)
    const otherRoom = await token('ZZZZZZZZ')
    expect((await upgrade(`/api/rooms/ABCDEFGH/ws?token=${otherRoom}`)).status).toBe(403)
  })

  it('ignores client-supplied seat headers', async () => {
    const res = await exports.default.fetch(
      new Request(`${BASE}/api/rooms/ABCDEFGH/ws?token=${await token('ABCDEFGH')}`, {
        headers: { Upgrade: 'websocket', 'x-match-side': 'gote', 'X-Match-Uid': 'someone-else' },
      }),
    )
    const ws = res.webSocket!
    ws.accept()
    const echo = nextMessage(ws)
    ws.send('who')
    expect(JSON.parse(await echo).side).toBe('sente')
    ws.close()
  })

  it('forwards a valid token to the room with the seat attached', async () => {
    const res = await upgrade(`/api/rooms/abcdefgh/ws?token=${await token('ABCDEFGH')}`)
    expect(res.status).toBe(101)
    const ws = res.webSocket!
    ws.accept()
    const echo = nextMessage(ws)
    ws.send('hello')
    expect(JSON.parse(await echo)).toEqual({ type: 'echo', side: 'sente', data: 'hello' })
    ws.close()
  })
})
