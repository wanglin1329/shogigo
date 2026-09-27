// SPDX-License-Identifier: GPL-3.0-only

// Site API router. Runs before TanStack Start (see src/server.ts) so that API
// requests and WebSocket upgrades never fall through to page rendering.

import { handleShogiOnlineApi } from './games/shogi/server/routes'

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
  if (url.pathname === '/api/health' && request.method === 'GET') {
    const row = await env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>()
    return json({ ok: true, d1: row?.ok === 1 })
  }

  const online = await handleShogiOnlineApi(request, env, url)
  if (online) return online

  // Every API path is matched explicitly; anything else is a JSON 404 rather
  // than a TanStack page.
  return apiError('not_found', 404)
}
