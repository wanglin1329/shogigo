// SPDX-License-Identifier: GPL-3.0-only

// Worker entry (wrangler.jsonc `main`). Static assets — including prerendered
// pages — are served before this runs; only non-asset requests get here.

import handler from '@tanstack/react-start/server-entry'

import { handleApi } from './api'
import { withDefaultCacheControl } from './cache-policy'

export { MatchRoom, Matchmaker } from './games/shogi/server/placeholder-rooms'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const api = await handleApi(request, env)
    return withDefaultCacheControl(api ?? (await handler.fetch(request)))
  },
} satisfies ExportedHandler<Env>
