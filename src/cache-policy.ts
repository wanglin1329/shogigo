// SPDX-License-Identifier: GPL-3.0-only

// Workers Caching (wrangler.jsonc `cache`) caches every Worker response that
// has no Cache-Control according to heuristic freshness (200 → 2 hours).
// Only routes that opt in with an explicit Cache-Control may be cached.
export function withDefaultCacheControl(response: Response): Response {
  if (response.status === 101 || response.headers.has('Cache-Control')) return response
  const copy = new Response(response.body, response)
  copy.headers.set('Cache-Control', 'no-store')
  return copy
}
