// SPDX-License-Identifier: GPL-3.0-only

// Site API router. Runs before TanStack Start (see src/server.ts) so that API
// requests and WebSocket upgrades never fall through to page rendering.
//
// P0 wires the endpoints the online play will use (docs/PLAN.md §2.1) with
// placeholder behaviour behind them; P3 replaces the Durable Objects with the
// ported upstream MatchRoom / Matchmaker.

import { isValidRoomCode, normalizeRoomCode } from './online/room-code'
import { verifyPlayerToken } from './online/token'

const MIN_SECRET_LENGTH = 16

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function apiError(code: string, status: number): Response {
  return json({ ok: false, error: { code } }, status)
}

// Headers the Worker uses to tell a Durable Object who is connecting. A client
// must never be able to set them, so they are stripped before forwarding and
// only re-added from verified values.
const INTERNAL_HEADER = /^x-(match|mm)-/i

function forwardTo(request: Request, trusted: Record<string, string> = {}): Request {
  const headers = new Headers()
  for (const [name, value] of request.headers) {
    if (!INTERNAL_HEADER.test(name)) headers.set(name, value)
  }
  for (const [name, value] of Object.entries(trusted)) headers.set(name, value)
  return new Request(request, { headers })
}

function isWebSocketUpgrade(request: Request): boolean {
  return request.headers.get('Upgrade')?.toLowerCase() === 'websocket'
}

const ROOM_WS = /^\/api\/rooms\/([^/]+)\/ws$/

function safeDecode(segment: string): string | null {
  try {
    return decodeURIComponent(segment)
  } catch {
    return null
  }
}

/** Returns a response for `/api/*`, or null when the path is not an API path. */
export async function handleApi(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url)
  if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) return null
  try {
    return await route(request, env, url)
  } catch (err) {
    // Clients read `ok` / `error.code` from the body, so failures stay JSON too.
    console.error('api error', url.pathname, err)
    return apiError('internal', 500)
  }
}

async function route(request: Request, env: Env, url: URL): Promise<Response> {
  const { pathname } = url

  if (pathname === '/api/health' && request.method === 'GET') {
    const row = await env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>()
    return json({ ok: true, d1: row?.ok === 1 })
  }

  if (pathname === '/api/match/ws' && request.method === 'GET') {
    if (!isWebSocketUpgrade(request)) return apiError('upgrade_required', 426)
    return env.MATCHMAKER.getByName('global').fetch(forwardTo(request))
  }

  const roomWs = ROOM_WS.exec(pathname)
  if (roomWs && request.method === 'GET') {
    if (!isWebSocketUpgrade(request)) return apiError('upgrade_required', 426)
    const code = normalizeRoomCode(safeDecode(roomWs[1]) ?? '')
    if (!isValidRoomCode(code)) return apiError('bad_room_code', 400)
    if (!env.TOKEN_SECRET || env.TOKEN_SECRET.length < MIN_SECRET_LENGTH) {
      return apiError('server_misconfigured', 500)
    }
    // The token is checked here, before the Durable Object is woken up.
    const token = url.searchParams.get('token') ?? ''
    const payload = await verifyPlayerToken(token, env.TOKEN_SECRET, Date.now())
    if (!payload || payload.roomCode !== code) return apiError('forbidden', 403)
    return env.MATCH_ROOM.getByName(code).fetch(
      forwardTo(request, { 'x-match-side': payload.side, 'x-match-uid': payload.uid }),
    )
  }

  // Every API path is matched explicitly; anything else is a JSON 404 rather
  // than a TanStack page.
  return apiError('not_found', 404)
}
