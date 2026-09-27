// SPDX-License-Identifier: GPL-3.0-only

// P0 placeholders for the two Durable Objects. Their class names are final
// (the wrangler migration registers them), so P3 swaps in the ported upstream
// implementations without a rename migration.
//
// Both only prove the plumbing: hibernatable WebSockets with a ping/pong
// auto-response that does not wake the object.

import { DurableObject } from 'cloudflare:workers'

abstract class HibernatingSocketObject extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  protected accept(tags: string[]): { client: WebSocket; server: WebSocket } {
    const [client, server] = Object.values(new WebSocketPair())
    this.ctx.acceptWebSocket(server, tags)
    return { client, server }
  }
}

export class MatchRoom extends HibernatingSocketObject {
  async fetch(request: Request): Promise<Response> {
    const side = request.headers.get('x-match-side') ?? 'unknown'
    const { client } = this.accept([side])
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const [side] = this.ctx.getTags(ws)
    ws.send(JSON.stringify({ type: 'echo', side, data: message }))
  }
}

export class Matchmaker extends HibernatingSocketObject {
  async fetch(): Promise<Response> {
    const { client, server } = this.accept([])
    const waitMs = Number(this.env.BOT_FALLBACK_SECONDS) * 1000
    // The server computes botAt from its own clock (docs/PLAN.md §6.2).
    server.send(
      JSON.stringify({ type: 'queued', playing: 0, botAt: new Date(Date.now() + waitMs).toISOString() }),
    )
    return new Response(null, { status: 101, webSocket: client })
  }
}
