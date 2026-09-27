// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2025~ Yuki Lab
// Copyright 2026 the shogi project contributors
// Modified 2026-09-27: only the online-play routes (rooms, matchmaking queue,
// online-stats, bot-result); feedback/backup are not ported yet (docs/PLAN.md
// §6.5-6). Rate limits use Cloudflare Rate Limiting bindings instead of an
// in-isolate Map, and a missing binding means "allow". /api/online-stats is
// edge-cacheable without a uid and sets the __Host-sg_uid cookie with one.
// Client-supplied x-match-*/x-mm-* headers never reach a Durable Object.
// Modified 2026-09-27: every JSON route rate-limits first and then reads the
// body with an actual byte cap (the stream is cut off past it), instead of
// trusting Content-Length and parsing before the limiter.

import { isGeneratedName } from '../../../online/nickname/words'
import { maskBadWords } from '../../../online/name-filter'
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from '../../../online/room-code'
import { signPlayerToken, verifyPlayerToken } from '../../../online/token'
import type { TokenPayload } from '../../../online/token'
import type { Move, Player } from '../core/engine'
import { handleBotResult } from './bot-result'
import { botFallbackMs } from './matchmaker'
import { ROOM_TTL_MS, TC_ALLOWED } from './match-room'
import type { SidePref, TimeControlType } from './protocol'
import { loadView } from './rating-store'

// ---- responses ---------------------------------------------------------------

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(body), { ...init, headers })
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ ok: false, error: { code, message } }, { status })
}

// Map room-domain error codes to stable HTTP statuses for API clients.
const ERROR_STATUS: Record<string, number> = {
  // Missing upstream: bot-result's bad side/result answered 500.
  bad_request: 400,
  bad_json: 400,
  bad_move: 400,
  bad_room_code: 400,
  bad_expected_revision: 400,
  illegal_move: 400,
  unauthorized: 401,
  forbidden: 403,
  room_full: 403,
  game_over: 403,
  not_your_turn: 403,
  not_found: 404,
  method_not_allowed: 405,
  not_started: 409,
  revision_conflict: 409,
  join_conflict: 409,
  match_started: 409,
  bad_time_control: 400,
  bad_ticket: 403,
  bad_kifu: 400,
  ticket_used: 409,
  rate_limited: 429,
  bad_state: 500,
  room_exists: 500,
  room_code_exhausted: 500,
}

function resultResponse(result: { ok: boolean; error?: { code: string } }): Response {
  if (result.ok) return jsonResponse(result)
  const status = ERROR_STATUS[result.error?.code ?? ''] ?? 500
  return jsonResponse(result, { status })
}

const TOO_LARGE = Symbol('too_large')

/**
 * Reads at most `maxBytes` of the body and parses it as JSON. Stops reading
 * (and cancels the stream) as soon as the cap is passed, whatever
 * Content-Length claims. null = missing or invalid JSON.
 */
async function readJsonBody<T>(request: Request, maxBytes: number): Promise<T | null | typeof TOO_LARGE> {
  if (!request.body) return null
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel().catch(() => {})
      return TOO_LARGE
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T
  } catch {
    return null
  }
}

/** Room requests are a uid, a name, a move: tiny. */
const ROOM_BODY_MAX_BYTES = 4 * 1024

const tooLarge = () => errorResponse(413, 'payload_too_large', 'Request body too large')

// ---- rate limiting --------------------------------------------------------------
// Coarse, per data centre and eventually consistent (Cloudflare Rate Limiting).
// Hard invariants — single-use tickets, the daily COM limit — live in D1.
// A missing binding (tests) or a limiter failure never blocks a player.

type Limiter = { limit(options: { key: string }): Promise<{ success: boolean }> } | undefined

export async function allowed(limiter: Limiter, request: Request): Promise<boolean> {
  if (!limiter) return true
  try {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
    return (await limiter.limit({ key: ip })).success
  } catch {
    return true
  }
}

// COM戦の結果。棋譜は200手でも600バイト程度。桁で余裕を見た上限
const BOT_RESULT_MAX_BYTES = 16 * 1024

// ---- helpers -------------------------------------------------------------------

function isValidUid(uid: unknown): uid is string {
  return typeof uid === 'string' && /^[0-9a-zA-Z-]{8,64}$/.test(uid)
}

// 表示名の唯一の入口（create / join / match の3経路すべてがここを通る）。
// クライアントの値は信用しない（WS直叩き対策でサーバーが本命）。
//
// 1. 自動生成の「〇〇の〇〇」は、語彙（src/online/nickname/words.ts）に完全一致するものだけ通す。
//    語彙が閉じているので、日本語のNG語リストを持たずに済んでいる。
// 2. それ以外は許可文字（半角英数字と _ - .）以外を除去 → 10文字 → NG語の伏せ字化。
export function normalizeDisplayName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  let s: string
  try {
    s = name.normalize('NFKC')
  } catch {
    s = name
  }
  if (isGeneratedName(s)) return s
  s = s.replace(/[^A-Za-z0-9_\-.]/g, '').slice(0, 10)
  s = maskBadWords(s)
  return s || null
}

// Missing/unknown -> "sente".
function normalizeSidePref(v: unknown): SidePref {
  return v === 'gote' || v === 'random' ? v : 'sente'
}

// Missing -> no time control; an explicit but invalid value -> null (=> 400).
function normalizeTimeControl(v: unknown): { type: TimeControlType; seconds: number } | null {
  if (v === undefined || v === null) return { type: 'none', seconds: 0 }
  if (typeof v !== 'object') return null
  const tc = v as { type?: unknown; seconds?: unknown }
  if (tc.type === undefined || tc.type === 'none') return { type: 'none', seconds: 0 }
  if (tc.type !== 'total' && tc.type !== 'per_move') return null
  const seconds = typeof tc.seconds === 'number' ? tc.seconds : NaN
  if (!TC_ALLOWED[tc.type].includes(seconds)) return null
  return { type: tc.type, seconds }
}

async function requireToken(request: Request, env: Env, roomCode: string): Promise<TokenPayload | null> {
  const auth = request.headers.get('Authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null
  if (!token) return null
  const payload = await verifyPlayerToken(token, env.TOKEN_SECRET, Date.now())
  if (!payload || payload.roomCode !== roomCode) return null
  return payload
}

async function issueToken(env: Env, roomCode: string, side: Player, uid: string): Promise<string> {
  return signPlayerToken({ roomCode, side, uid, exp: Date.now() + ROOM_TTL_MS }, env.TOKEN_SECRET)
}

// Headers the Worker uses to tell a Durable Object who is connecting. A client
// must never be able to set them, so they are stripped before forwarding and
// only re-added from verified values.
const INTERNAL_HEADER = /^x-(match|mm)-/i

export function forwardTo(request: Request, trusted: Record<string, string> = {}): Request {
  const headers = new Headers()
  for (const [name, value] of request.headers) {
    if (!INTERNAL_HEADER.test(name)) headers.set(name, value)
  }
  for (const [name, value] of Object.entries(trusted)) headers.set(name, value)
  return new Request(request, { headers })
}

/** `__Host-` cookie: survives Safari's 7-day cap on script-written storage (docs/PLAN.md §6.3). */
export const UID_COOKIE = '__Host-sg_uid'
const UID_COOKIE_MAX_AGE = 400 * 24 * 60 * 60

function uidCookie(uid: string): string {
  // Not HttpOnly on purpose: the page reads it to restore a lost localStorage uid.
  return `${UID_COOKIE}=${uid}; Max-Age=${UID_COOKIE_MAX_AGE}; Path=/; Secure; SameSite=Lax`
}

// ---- routing -------------------------------------------------------------------

/**
 * Online-play API. Returns null for paths it does not own (the site router
 * answers those). Every owned path is matched explicitly.
 */
export async function handleShogiOnlineApi(request: Request, env: Env, url: URL): Promise<Response | null> {
  const segments = url.pathname.split('/').filter(Boolean) // ["api", ...]
  const owned =
    (segments[1] === 'match' && segments.length === 3 && segments[2] === 'ws') ||
    (segments[1] === 'online-stats' && segments.length === 2) ||
    (segments[1] === 'bot-result' && segments.length === 2) ||
    (segments[1] === 'rooms' && (segments.length === 2 || segments.length === 4))
  if (!owned) return null

  // Fail loudly if `wrangler secret put TOKEN_SECRET` was forgotten: a guessable
  // default would let anyone forge seat credentials.
  if (typeof env.TOKEN_SECRET !== 'string' || env.TOKEN_SECRET.length < 16) {
    return errorResponse(500, 'server_misconfigured', 'TOKEN_SECRET is not configured')
  }

  if (segments[1] === 'match') return handleMatchWs(request, env, url)
  if (segments[1] === 'online-stats') return handleOnlineStats(request, env, url)
  if (segments[1] === 'bot-result') return handleBotResultRequest(request, env)

  // POST /api/rooms — create a room.
  if (segments.length === 2) {
    if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Use POST')
    return handleCreateRoom(request, env)
  }

  // /api/rooms/{code}/{action}
  const roomCode = normalizeRoomCode(safeDecode(segments[2]) ?? '')
  if (!roomCode || !isValidRoomCode(roomCode)) {
    return errorResponse(400, 'bad_room_code', 'Invalid room code')
  }
  const action = segments[3]
  const stub = env.MATCH_ROOM.getByName(roomCode)

  if (action === 'join') {
    if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Use POST')
    if (!(await allowed(env.RL_JOIN, request))) {
      return errorResponse(429, 'rate_limited', 'Too many join attempts; try again later')
    }
    const body = await readJsonBody<{ uid?: unknown; displayName?: unknown }>(request, ROOM_BODY_MAX_BYTES)
    if (body === TOO_LARGE) return tooLarge()
    if (!body || !isValidUid(body.uid)) return errorResponse(400, 'bad_request', 'uid is required')
    const result = await stub.join({ uid: body.uid, displayName: normalizeDisplayName(body.displayName) })
    if (!result.ok) return resultResponse(result)
    const token = await issueToken(env, roomCode, result.yourSide, body.uid)
    return jsonResponse({ ...result, token })
  }

  // Everything below is play traffic: one generous per-IP limit.
  if (!(await allowed(env.RL_PLAY, request))) {
    return errorResponse(429, 'rate_limited', 'Too many requests; try again later')
  }

  if (action === 'ws') {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return errorResponse(426, 'upgrade_required', 'Expected WebSocket upgrade')
    }
    // The token is checked here, before the Durable Object is woken up.
    const token = url.searchParams.get('token') || ''
    const payload = await verifyPlayerToken(token, env.TOKEN_SECRET, Date.now())
    if (!payload || payload.roomCode !== roomCode) {
      return errorResponse(401, 'unauthorized', 'Missing or invalid token')
    }
    return stub.fetch(forwardTo(request, { 'x-match-side': payload.side, 'x-match-uid': payload.uid }))
  }

  if (action === 'state') {
    if (request.method !== 'GET') return errorResponse(405, 'method_not_allowed', 'Use GET')
    const payload = await requireToken(request, env, roomCode)
    if (!payload) return errorResponse(401, 'unauthorized', 'Missing or invalid token')
    return resultResponse(await stub.getStateFor({ side: payload.side, uid: payload.uid }))
  }

  if (action === 'move') {
    if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Use POST')
    const payload = await requireToken(request, env, roomCode)
    if (!payload) return errorResponse(401, 'unauthorized', 'Missing or invalid token')
    const body = await readJsonBody<{ expectedRevision?: unknown; move?: unknown }>(request, ROOM_BODY_MAX_BYTES)
    if (body === TOO_LARGE) return tooLarge()
    if (!body) return errorResponse(400, 'bad_json', 'Invalid JSON body')
    const expectedRevision =
      typeof body.expectedRevision === 'number' && Number.isInteger(body.expectedRevision)
        ? body.expectedRevision
        : null
    if (expectedRevision === null || expectedRevision < 0) {
      return errorResponse(400, 'bad_expected_revision', 'expectedRevision is required')
    }
    const move = body.move as Move | undefined
    if (!move || (move.type !== 'move' && move.type !== 'drop')) {
      return errorResponse(400, 'bad_move', 'Invalid move payload')
    }
    return resultResponse(await stub.submitMove({ side: payload.side, uid: payload.uid, expectedRevision, move }))
  }

  // POST /api/rooms/{code}/settings — pre-join settings edit by the creator.
  // The seat may move, so the response always carries a freshly signed token.
  if (action === 'settings') {
    if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Use POST')
    const payload = await requireToken(request, env, roomCode)
    if (!payload) return errorResponse(401, 'unauthorized', 'Missing or invalid token')
    const body = await readJsonBody<{ side?: unknown; tc?: unknown }>(request, ROOM_BODY_MAX_BYTES)
    if (body === TOO_LARGE) return tooLarge()
    if (!body) return errorResponse(400, 'bad_json', 'Invalid JSON body')
    const tc = normalizeTimeControl(body.tc)
    if (!tc) return errorResponse(400, 'bad_time_control', 'Invalid time control')
    const result = await stub.updateSettings({
      uid: payload.uid,
      sidePref: normalizeSidePref(body.side),
      tcType: tc.type,
      tcSeconds: tc.seconds,
    })
    if (!result.ok) return resultResponse(result)
    const token = await issueToken(env, roomCode, result.yourSide, payload.uid)
    return jsonResponse({ ...result, token })
  }

  if (action === 'resign') {
    if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Use POST')
    const payload = await requireToken(request, env, roomCode)
    if (!payload) return errorResponse(401, 'unauthorized', 'Missing or invalid token')
    const read = await readJsonBody<{ expectedRevision?: unknown }>(request, ROOM_BODY_MAX_BYTES)
    if (read === TOO_LARGE) return tooLarge()
    const body = read ?? {}
    const expectedRevision =
      typeof body.expectedRevision === 'number' && Number.isInteger(body.expectedRevision)
        ? body.expectedRevision
        : null
    return resultResponse(await stub.resign({ side: payload.side, uid: payload.uid, expectedRevision }))
  }

  return errorResponse(404, 'not_found', 'Unknown API endpoint')
}

function safeDecode(segment: string): string | null {
  try {
    return decodeURIComponent(segment)
  } catch {
    return null
  }
}

// ---- matchmaking -----------------------------------------------------------------

// The queue lives in the single global Matchmaker DO. This handler only does
// the edge work: validation, rate limiting, display-name normalization, then
// forwards the upgrade with x-mm-* identity headers built here (the client's
// own x-mm-* headers are dropped). The name is percent-encoded to stay header-safe.
async function handleMatchWs(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return errorResponse(426, 'upgrade_required', 'Expected WebSocket upgrade')
  }
  const uid = url.searchParams.get('uid')
  if (!isValidUid(uid)) return errorResponse(400, 'bad_request', 'uid is required')
  if (!(await allowed(env.RL_QUEUE, request))) {
    // HTTP 429 だと new WebSocket() には接続失敗(1006)としか見えず、クライアントが
    // 文言を出し分けられない。いったん 101 で受けてから error を送って閉じる
    const pair = new WebSocketPair()
    const server = pair[1]
    server.accept()
    try {
      server.send(
        JSON.stringify({
          type: 'error',
          error: { code: 'rate_limited', message: 'Too many queue attempts; try again later' },
        }),
      )
      server.close(1000, 'rate_limited')
    } catch {
      // ignore
    }
    return new Response(null, { status: 101, webSocket: pair[0] })
  }
  const name = normalizeDisplayName(url.searchParams.get('name'))
  const trusted: Record<string, string> = {
    'x-mm-uid': uid,
    'x-mm-bot': url.searchParams.get('bot') === '0' ? '0' : '1',
    // hr=1 = この人は段級位を出さない設定。相手に渡す値を Matchmaker が null にする
    'x-mm-hr': url.searchParams.get('hr') === '1' ? '1' : '0',
  }
  if (name) trusted['x-mm-name'] = encodeURIComponent(name)
  return env.MATCHMAKER.getByName('global').fetch(forwardTo(request, trusted))
}

// Display-only approximation; a failure must never break the lobby, so every
// error path degrades to {"playing": 0}.
// Without a uid the answer is the same for everyone: edge-cached for 5 s
// (Workers Caching), so lobby polling does not all land on the global DO.
// With a uid it is personal: no-store, plus the uid cookie.
async function handleOnlineStats(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== 'GET') return errorResponse(405, 'method_not_allowed', 'Use GET')
  const uid = url.searchParams.get('uid')
  const personal = isValidUid(uid)
  const publicHeaders = { 'Cache-Control': 'public, max-age=5' }
  if (!(await allowed(env.RL_STATS, request))) {
    return personal
      ? jsonResponse({ playing: 0 })
      : jsonResponse({ playing: 0, botFallbackSeconds: botFallbackMs(env.BOT_FALLBACK_SECONDS) / 1000 }, { headers: publicHeaders })
  }
  let playing = 0
  try {
    const stats = await env.MATCHMAKER.getByName('global').getStats()
    playing = typeof stats.playing === 'number' ? stats.playing : 0
  } catch {
    playing = 0
  }
  // The lobby wording ("…秒で見つからなければ COM") follows the server setting.
  if (!personal) {
    return jsonResponse(
      { playing, botFallbackSeconds: botFallbackMs(env.BOT_FALLBACK_SECONDS) / 1000 },
      { headers: publicHeaders },
    )
  }
  const headers = { 'Set-Cookie': uidCookie(uid) }
  try {
    return jsonResponse({ playing, rating: await loadView(env.DB, uid) }, { headers })
  } catch {
    // 実力値が引けなくても人数表示は壊さない
    return jsonResponse({ playing }, { headers })
  }
}

// COM戦の結果。検証の中身は bot-result.ts（ここは入口の作法だけ）。
async function handleBotResultRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'Use POST')
  if (!(await allowed(env.RL_BOT_RESULT, request))) {
    return errorResponse(429, 'rate_limited', 'Too many submissions; try again later')
  }
  const body = await readJsonBody<Record<string, unknown>>(request, BOT_RESULT_MAX_BYTES)
  if (body === TOO_LARGE) return tooLarge()
  if (!body) return errorResponse(400, 'bad_json', 'Invalid JSON body')
  return resultResponse(await handleBotResult(env, body, Date.now()))
}

async function handleCreateRoom(request: Request, env: Env): Promise<Response> {
  if (!(await allowed(env.RL_CREATE, request))) {
    return errorResponse(429, 'rate_limited', 'Too many rooms created; try again later')
  }
  const body = await readJsonBody<{ uid?: unknown; displayName?: unknown; side?: unknown; tc?: unknown }>(
    request,
    ROOM_BODY_MAX_BYTES,
  )
  if (body === TOO_LARGE) return tooLarge()
  if (!body || !isValidUid(body.uid)) return errorResponse(400, 'bad_request', 'uid is required')
  const displayName = normalizeDisplayName(body.displayName)
  const sidePref = normalizeSidePref(body.side)
  const tc = normalizeTimeControl(body.tc)
  if (!tc) return errorResponse(400, 'bad_time_control', 'Invalid time control')

  // Retry on the astronomically unlikely room-code collision.
  for (let attempt = 0; attempt < 8; attempt++) {
    const roomCode = generateRoomCode(10)
    const result = await env.MATCH_ROOM.getByName(roomCode).createRoom({
      roomCode,
      uid: body.uid,
      displayName,
      sidePref,
      tcType: tc.type,
      tcSeconds: tc.seconds,
    })
    if (!result.ok && result.error.code === 'room_exists') continue
    if (!result.ok) return resultResponse(result)
    const token = await issueToken(env, roomCode, result.yourSide, body.uid)
    return jsonResponse({ ...result, token })
  }
  return errorResponse(500, 'room_code_exhausted', 'Failed to allocate a unique room code')
}
