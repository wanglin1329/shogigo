// SPDX-License-Identifier: GPL-3.0-only

// Site-level API behaviour on top of the ported online backend: explicit
// routing, the changes this repository makes to upstream (botAt, public state
// without histories, online-stats caching + uid cookie, fail-open limiter), and
// the header-spoofing guard.

import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import { signPlayerToken } from '../../src/online/token'
import { allowed } from '../../src/games/shogi/server/routes'

const SECRET = 'test-secret-for-vitest-only'
const BASE = 'https://shogi.test'
const UID = 'eeeeeeee-5555-4555-8555-555555555555'

let ipSeq = 1
const nextIp = () => `10.9.${Math.floor(++ipSeq / 256)}.${ipSeq % 256}`

function get(path: string, headers: Record<string, string> = {}) {
  return exports.default.fetch(new Request(`${BASE}${path}`, { headers: { 'CF-Connecting-IP': nextIp(), ...headers } }))
}

function upgrade(path: string, headers: Record<string, string> = {}) {
  return get(path, { Upgrade: 'websocket', ...headers })
}

function collect(ws: WebSocket) {
  const messages: Record<string, unknown>[] = []
  ws.accept()
  ws.addEventListener('message', (e) => {
    if (typeof e.data === 'string' && e.data !== 'pong') messages.push(JSON.parse(e.data))
  })
  return messages
}

function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = () => {
      if (predicate()) return resolve()
      if (Date.now() - start > timeoutMs) return reject(new Error('waitFor timeout'))
      setTimeout(tick, 10)
    }
    tick()
  })
}

async function createRoom(): Promise<{ code: string; token: string }> {
  const res = await exports.default.fetch(
    new Request(`${BASE}/api/rooms`, {
      method: 'POST',
      headers: { 'CF-Connecting-IP': nextIp() },
      body: JSON.stringify({ uid: UID, side: 'sente' }),
    }),
  )
  const json = (await res.json()) as { ok: boolean; token: string; match: { room_code: string } }
  expect(json.ok).toBe(true)
  return { code: json.match.room_code, token: json.token }
}

describe('routing', () => {
  it('health checks D1', async () => {
    const res = await get('/api/health')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({ ok: true, d1: true })
  })

  it('unknown /api paths are JSON 404s, not pages', async () => {
    const res = await get('/api/nope')
    expect(res.status).toBe(404)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('not_found')
    expect((await get('/api/rooms/ABCDEFGH/unknown')).status).toBe(404)
  })

  it('non-API paths fall through to the page handler with no-store by default', async () => {
    const res = await get('/online')
    expect(await res.text()).toBe('tanstack page')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('WebSocket endpoints require an upgrade', async () => {
    expect((await get(`/api/match/ws?uid=${UID}`)).status).toBe(426)
    expect((await get('/api/rooms/ABCDEFGH/ws')).status).toBe(426)
  })
})

describe('matchmaking queue: botAt', () => {
  it('announces when COM will be offered, from the server clock', async () => {
    const before = Date.now()
    const res = await upgrade(`/api/match/ws?uid=${UID}`)
    expect(res.status).toBe(101)
    const messages = collect(res.webSocket!)
    await waitFor(() => messages.length > 0)
    const queued = messages[0] as { type: string; botAt: string; server_now: string }
    expect(queued.type).toBe('queued')
    const waitMs = Date.parse(queued.botAt) - before
    expect(waitMs).toBeGreaterThanOrEqual(30_000)
    expect(waitMs).toBeLessThan(35_000)
    // server_now lets the client correct its clock skew; botAt is exactly 30 s after it.
    expect(Date.parse(queued.botAt) - Date.parse(queued.server_now)).toBe(30_000)
    res.webSocket!.close()
  })

  it('sends botAt: null when the player turned the COM fallback off', async () => {
    const res = await upgrade(`/api/match/ws?uid=${UID}&bot=0`)
    const messages = collect(res.webSocket!)
    await waitFor(() => messages.length > 0)
    expect(messages[0]).toMatchObject({ type: 'queued', botAt: null })
    expect(Number.isFinite(Date.parse((messages[0] as { server_now: string }).server_now))).toBe(true)
    res.webSocket!.close()
  })

  it('re-sends a fresh botAt on reconnection', async () => {
    const first = await upgrade(`/api/match/ws?uid=${UID}`)
    const a = collect(first.webSocket!)
    await waitFor(() => a.length > 0)
    await new Promise((r) => setTimeout(r, 20))
    const second = await upgrade(`/api/match/ws?uid=${UID}`)
    const b = collect(second.webSocket!)
    await waitFor(() => b.length > 0)
    const botAtA = Date.parse((a[0] as { botAt: string }).botAt)
    const botAtB = Date.parse((b[0] as { botAt: string }).botAt)
    expect(botAtB).toBeGreaterThan(botAtA)
    second.webSocket!.close()
  })
})

describe('room WebSocket', () => {
  async function token(roomCode: string, exp = Date.now() + 60_000) {
    return signPlayerToken({ roomCode, side: 'sente', uid: UID, exp }, SECRET)
  }

  it('rejects a malformed room code', async () => {
    expect((await upgrade('/api/rooms/bad!code/ws?token=x')).status).toBe(400)
    expect((await upgrade('/api/rooms/%E0%A4%A/ws?token=x')).status).toBe(400)
  })

  it('rejects a missing, forged, expired, or other-room token before waking the DO', async () => {
    expect((await upgrade('/api/rooms/ABCDEFGH/ws')).status).toBe(401)
    expect((await upgrade('/api/rooms/ABCDEFGH/ws?token=forged.token')).status).toBe(401)
    const expired = await token('ABCDEFGH', Date.now() - 1)
    expect((await upgrade(`/api/rooms/ABCDEFGH/ws?token=${expired}`)).status).toBe(401)
    const otherRoom = await token('ZZZZZZZZ')
    expect((await upgrade(`/api/rooms/ABCDEFGH/ws?token=${otherRoom}`)).status).toBe(401)
  })

  it('ignores client-supplied seat headers and sends a public state without histories', async () => {
    const room = await createRoom()
    const res = await upgrade(`/api/rooms/${room.code}/ws?token=${room.token}`, {
      'x-match-side': 'gote',
      'X-Match-Uid': 'someone-else-0000',
    })
    expect(res.status).toBe(101)
    const messages = collect(res.webSocket!)
    await waitFor(() => messages.some((m) => m.type === 'state'))
    const state = messages.find((m) => m.type === 'state') as {
      yourSide: string
      match: { state: Record<string, unknown> }
    }
    expect(state.yourSide).toBe('sente')
    expect(state.match.state).not.toHaveProperty('positionHistory')
    expect(state.match.state).not.toHaveProperty('checkHistory')
    expect(state.match.state).not.toHaveProperty('turnHistory')
    expect(state.match.state).toHaveProperty('usiMoveHistory')
    res.webSocket!.close()
  })

  it('HTTP state is public too', async () => {
    const room = await createRoom()
    const res = await get(`/api/rooms/${room.code}/state`, { Authorization: `Bearer ${room.token}` })
    const json = (await res.json()) as { ok: boolean; match: { state: Record<string, unknown> } }
    expect(json.ok).toBe(true)
    expect(json.match.state).not.toHaveProperty('positionHistory')
  })
})

describe('online-stats', () => {
  it('is edge-cacheable and cookie-free without a uid', async () => {
    const res = await get('/api/online-stats')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=5')
    expect(res.headers.get('Set-Cookie')).toBeNull()
    // The lobby's COM wording follows the server setting (wrangler vars: 30).
    expect(await res.json()).toEqual({ playing: 0, botFallbackSeconds: 30 })
  })

  it('is personal with a uid: no-store, rating, and the uid cookie', async () => {
    const res = await get(`/api/online-stats?uid=${UID}`)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const cookie = res.headers.get('Set-Cookie') ?? ''
    expect(cookie).toContain(`__Host-sg_uid=${UID}`)
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('Path=/')
    expect(cookie).not.toContain('HttpOnly')
    const json = (await res.json()) as { playing: number; rating?: { rank: number; rating: number } }
    expect(json.rating).toMatchObject({ rank: 4, rating: 1500 })
  })
})

describe('JSON bodies are capped by what is actually read', () => {
  function post(path: string, body: BodyInit, headers: Record<string, string> = {}) {
    return exports.default.fetch(
      new Request(`${BASE}${path}`, { method: 'POST', headers: { 'CF-Connecting-IP': nextIp(), ...headers }, body }),
    )
  }

  it('refuses an oversized bot-result even when Content-Length lies', async () => {
    const huge = JSON.stringify({ ticket: 'x', side: 'sente', result: 'win', moves: 'm'.repeat(40_000) })
    const res = await post('/api/bot-result', huge, { 'Content-Length': '10' })
    expect(res.status).toBe(413)
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'payload_too_large' } })
  })

  it('refuses an oversized body streamed without Content-Length', async () => {
    const chunk = new TextEncoder().encode('x'.repeat(1024))
    let sent = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ < 40) controller.enqueue(chunk)
        else controller.close()
      },
    })
    const res = await post('/api/rooms', stream)
    expect(res.status).toBe(413)
    // Reading stopped at the cap instead of draining all 40 KB.
    expect(sent).toBeLessThan(40)
  })

  it('still accepts normal bodies', async () => {
    await createRoom()
  })
})

describe('rate limiter wrapper', () => {
  const request = new Request(BASE, { headers: { 'CF-Connecting-IP': '10.0.0.1' } })

  it('allows when no binding is configured', async () => {
    expect(await allowed(undefined, request)).toBe(true)
  })

  it('allows when the limiter itself fails', async () => {
    const broken = { limit: async () => Promise.reject(new Error('down')) }
    expect(await allowed(broken, request)).toBe(true)
  })

  it('keys by client IP and honours a refusal', async () => {
    const keys: string[] = []
    const strict = {
      limit: async ({ key }: { key: string }) => {
        keys.push(key)
        return { success: false }
      },
    }
    expect(await allowed(strict, request)).toBe(false)
    expect(keys).toEqual(['10.0.0.1'])
  })
})
