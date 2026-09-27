// SPDX-License-Identifier: GPL-3.0-only

// Typed calls to the online API (same origin, /api). Every response body is
// JSON — the server sends {ok:false,error:{code}} with a matching HTTP status —
// so callers branch on `ok`, never on the status. A request that never reached
// the server becomes {ok:false,error:{code:'network'}} instead of throwing.

import type { Move, Player } from '../core/engine'
import type {
  ApiError,
  BotResultRequest,
  BotResultResponse,
  DisconnectInfo,
  MatchPayload,
  MoveResult,
  OnlineStats,
  SidePref,
  TimeControlType,
} from '../server/protocol'

export const API_BASE = '/api'

export type Failure = { ok: false; error: ApiError; match?: MatchPayload; disconnect?: DisconnectInfo }

export type RoomEntry = {
  ok: true
  match: MatchPayload
  token: string
  yourSide: Player
  disconnect: DisconnectInfo
}

export type RoomState = { ok: true; match: MatchPayload; yourSide: Player; disconnect: DisconnectInfo }

export interface TimeControl {
  type: TimeControlType
  /** 0 for 'none'; total: 180/300/600, per_move: 10/30/60. */
  seconds: number
}

function failure(code: string, message = ''): Failure {
  return { ok: false, error: { code, message } }
}

async function call<T extends { ok: true }>(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown; token?: string | null } = {},
): Promise<T | Failure> {
  const headers: Record<string, string> = {}
  if (options.token) headers.Authorization = `Bearer ${options.token}`
  const init: RequestInit = { method: options.method ?? 'GET', headers, cache: 'no-store' }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(options.body)
  }
  let res: Response
  try {
    res = await fetch(API_BASE + path, init)
  } catch {
    return failure('network')
  }
  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    // Not JSON: a proxy error page or similar.
  }
  if (json && typeof json === 'object' && 'ok' in json) {
    const body = json as { ok: unknown; error?: unknown }
    if (body.ok === true) return json as T
    const error = body.error as Partial<ApiError> | undefined
    return { ...(json as object), ok: false, error: { code: String(error?.code ?? 'unknown'), message: String(error?.message ?? '') } } as Failure
  }
  return failure(res.ok ? 'bad_response' : `http_${res.status}`)
}

const room = (code: string, action: string) => `/rooms/${encodeURIComponent(code)}/${action}`

export function createRoom(input: {
  uid: string
  displayName: string | null
  side: SidePref
  tc: TimeControl
}): Promise<RoomEntry | Failure> {
  return call<RoomEntry>('/rooms', { method: 'POST', body: input })
}

/** Idempotent per uid: joining a room you already sit in returns your seat again. */
export function joinRoom(code: string, input: { uid: string; displayName: string | null }): Promise<RoomEntry | Failure> {
  return call<RoomEntry>(room(code, 'join'), { method: 'POST', body: input })
}

/** Host only, before the game starts. May re-issue the token (seat change). */
export function updateRoomSettings(
  code: string,
  token: string,
  input: { side: SidePref; tc: TimeControl },
): Promise<(RoomState & { token?: string }) | Failure> {
  return call<RoomState & { token?: string }>(room(code, 'settings'), { method: 'POST', body: input, token })
}

export function getRoomState(code: string, token: string): Promise<RoomState | Failure> {
  return call<RoomState>(room(code, 'state'), { token })
}

export function postMove(
  code: string,
  token: string,
  input: { expectedRevision: number; move: Move },
): Promise<Extract<MoveResult, { ok: true }> | Failure> {
  return call<Extract<MoveResult, { ok: true }>>(room(code, 'move'), { method: 'POST', body: input, token })
}

export function postResign(
  code: string,
  token: string,
  input: { expectedRevision: number | null },
): Promise<Extract<MoveResult, { ok: true }> | Failure> {
  return call<Extract<MoveResult, { ok: true }>>(room(code, 'resign'), { method: 'POST', body: input, token })
}

/** Players online; with a uid also your rating (and the server refreshes the uid cookie). */
/**
 * Players online (+ my rating when `uid` is given). Unlike the other routes,
 * this body has no `ok` field ({ playing, rating? }), so it is read directly.
 * Never throws: any failure reads as nobody online.
 */
export async function getOnlineStats(uid?: string | null): Promise<OnlineStats> {
  try {
    const res = await fetch(`${API_BASE}/online-stats${uid ? `?uid=${encodeURIComponent(uid)}` : ''}`)
    const body = (await res.json()) as Partial<OnlineStats>
    return {
      playing: typeof body.playing === 'number' ? body.playing : 0,
      ...(body.rating && typeof body.rating.rank === 'number' ? { rating: body.rating } : {}),
      ...(typeof body.botFallbackSeconds === 'number' ? { botFallbackSeconds: body.botFallbackSeconds } : {}),
    }
  } catch {
    return { playing: 0 }
  }
}

export function postBotResult(body: BotResultRequest): Promise<BotResultResponse | Failure> {
  return call<Extract<BotResultResponse, { ok: true }>>('/bot-result', { method: 'POST', body })
}

// ---------------------------------------------------------------- messages

export type ErrorContext = 'create' | 'join' | 'settings' | 'move' | 'resign' | 'match' | 'connect'

const RETRY_WITH_NEW_INVITE = 'どちらかが新しい招待リンクを作って、もう一度送ってください。'

/** Japanese message for an error code, worded for where it happened. */
export function errorMessage(code: string, context: ErrorContext): string {
  switch (code) {
    case 'network':
      return 'サーバーに届きませんでした。電波や Wi-Fi の状態を確かめて、もう一度お試しください。'
    case 'rate_limited':
      return '短い時間にアクセスが集中しています。少し間をおいてからお試しください。'
    case 'room_full':
      return `この部屋には、もう2人がそろっています。${RETRY_WITH_NEW_INVITE}`
    case 'game_over':
      return context === 'join'
        ? `この対局はもう終わっています。${RETRY_WITH_NEW_INVITE}`
        : 'この対局はもう終わっています。'
    case 'not_found':
      return context === 'join'
        ? `部屋が見つかりません。招待リンクの有効期限（24時間）が過ぎたか、リンクが途中で切れているかもしれません。${RETRY_WITH_NEW_INVITE}`
        : '部屋の有効期限が切れました。'
    case 'bad_room_code':
      return '招待リンクの形が正しくありません。リンクが最後までコピーされているか確かめてください。'
    case 'match_started':
      return '対局が始まったので、手番や持ち時間はもう変えられません。'
    case 'queue_timeout':
      return 'しばらく待ちましたが、相手が見つかりませんでした。時間をおいてまたお試しください。'
    case 'already_matched':
      return '別のタブや端末で対局が始まるところです。そちらの画面を確認してください。'
    case 'match_failed':
      return '対局の準備に失敗しました。もう一度お試しください。'
    case 'connect_failed':
      return '対局につなげませんでした。もう一度お試しください。'
    case 'connection_lost':
      return '通信が途切れました。もう一度お試しください。'
    case 'server_misconfigured':
      return 'サーバーの準備が整っていません。時間をおいてお試しください。'
    default:
      switch (context) {
        case 'create':
          return '部屋を作れませんでした。通信の状態を確かめて、もう一度お試しください。'
        case 'join':
          return '部屋に入れませんでした。時間をおいて、もう一度お試しください。'
        case 'settings':
          return '設定を変えられませんでした。通信の状態を確かめてください。'
        case 'move':
          return '指し手を送れませんでした。通信の状態を確かめてください。'
        case 'resign':
          return '投了を送れませんでした。通信の状態を確かめてください。'
        default:
          return 'うまくいきませんでした。もう一度お試しください。'
      }
  }
}
