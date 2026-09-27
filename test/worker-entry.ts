// SPDX-License-Identifier: GPL-3.0-only

// Test-only Worker entry: src/server.ts with a stand-in for the TanStack page
// handler (its virtual server entry only resolves inside the app's Vite build).

import { handleApi } from '../src/api'
import { withDefaultCacheControl } from '../src/cache-policy'

export { MatchRoom } from '../src/games/shogi/server/match-room'
export { Matchmaker } from '../src/games/shogi/server/matchmaker'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Stand-in for the TanStack handler: a page response without Cache-Control.
    const page = () => new Response('tanstack page', { headers: { 'Content-Type': 'text/html' } })
    return withDefaultCacheControl((await handleApi(request, env)) ?? page())
  },
} satisfies ExportedHandler<Env>
