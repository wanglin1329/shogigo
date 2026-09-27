// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2025~ Yuki Lab
// Copyright 2026 the shogi project contributors
// Modified 2026-09-27: added format v2 that carries the initial position (initialSfen,
// docs/PLAN.md §2.4); encode/decode now take and return { initialSfen, usiMoves }.

// 共有URL（/?k=…&m=…）の中身。
//
// v1（平手）: 先頭1バイト = 1、以降は1手2バイト（15ビット）。
//   上位7ビット: 移動元（0〜80 のマス番号 / 駒を打つときは 81〜87）
//   中位7ビット: 移動先（0〜80）
//   下位1ビット: 成るなら1
// v2（途中局面から）: 先頭1バイト = 2、次の1バイト = SFEN の長さ N、
//   続く N バイト = 正規化した SFEN（ASCII）、以降は v1 と同じ1手2バイト。
// 平手は必ず v1 で書く（URL を短く保ち、v1 しか読めない古いリンクとも揃える）。
// 🔴 圧縮はしない（実測で 126バイト → 128バイト と増えた）。

import { DROP_ORDER, formatUsiMove, parseUsiMove, squareIndexToXY, xyToSquareIndex } from './moves'
import { normalizeInitialSfen } from './sfen'

export const KIFU_URL_VERSION = 1
export const KIFU_URL_VERSION_WITH_POSITION = 2

const DROP_INDEX_BASE = 81

const B64URL_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export type SharedKifu = {
  /** 開始局面。null は平手 */
  initialSfen: string | null
  usiMoves: string[]
}

// btoa / atob に頼らない（ブラウザと workerd で同じ結果になることを担保するため）
function bytesToBase64Url(bytes: number[]): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = bytes[i + 1]
    const b2 = bytes[i + 2]
    out += B64URL_CHARS[b0 >> 2]
    if (b1 === undefined) {
      out += B64URL_CHARS[(b0 & 0x03) << 4]
      break
    }
    out += B64URL_CHARS[((b0 & 0x03) << 4) | (b1 >> 4)]
    if (b2 === undefined) {
      out += B64URL_CHARS[(b1 & 0x0f) << 2]
      break
    }
    out += B64URL_CHARS[((b1 & 0x0f) << 2) | (b2 >> 6)]
    out += B64URL_CHARS[b2 & 0x3f]
  }
  return out
}

function base64UrlToBytes(text: string): number[] | null {
  const bytes: number[] = []
  let buffer = 0
  let bits = 0
  for (const ch of text) {
    const value = B64URL_CHARS.indexOf(ch)
    if (value < 0) return null
    buffer = (buffer << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
    }
  }
  return bytes
}

function encodeMoves(usiMoves: readonly string[], bytes: number[]): boolean {
  for (const usi of usiMoves) {
    const move = parseUsiMove(usi)
    if (!move) return false

    let fromCode: number
    let promote = 0
    if (move.type === 'drop') {
      const dropIndex = DROP_ORDER.indexOf(move.pieceType)
      if (dropIndex < 0) return false
      fromCode = DROP_INDEX_BASE + dropIndex
    } else {
      fromCode = xyToSquareIndex(move.fromX, move.fromY)
      promote = move.promote ? 1 : 0
    }
    const toCode = xyToSquareIndex(move.toX, move.toY)
    const packed = (fromCode << 8) | (toCode << 1) | promote
    bytes.push((packed >> 8) & 0xff, packed & 0xff)
  }
  return true
}

function decodeMoves(bytes: number[], start: number): string[] | null {
  const body = bytes.length - start
  // base64 は4文字単位でしか区切れないため、末尾に0が1バイト余ることがある
  const moveCount = Math.floor(body / 2)
  if (body - moveCount * 2 > 1) return null

  const moves: string[] = []
  for (let i = 0; i < moveCount; i++) {
    const packed = (bytes[start + i * 2] << 8) | bytes[start + 1 + i * 2]
    if (packed >> 15 !== 0) return null
    const fromCode = (packed >> 8) & 0x7f
    const toCode = (packed >> 1) & 0x7f
    const promote = (packed & 1) === 1
    if (toCode > 80) return null

    const to = squareIndexToXY(toCode)
    if (fromCode >= DROP_INDEX_BASE) {
      const pieceType = DROP_ORDER[fromCode - DROP_INDEX_BASE]
      if (!pieceType || promote) return null
      moves.push(formatUsiMove({ type: 'drop', pieceType, toX: to.x, toY: to.y }))
      continue
    }
    const from = squareIndexToXY(fromCode)
    moves.push(formatUsiMove({ type: 'move', fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, promote }))
  }
  return moves
}

/**
 * 対局を `k` の値にする。読めない手・読めない開始局面が混ざっていたら null。
 * 手が0手でも文字列を返す（空の棋譜・局面だけも共有できる）。
 */
export function encodeKifuParam(kifu: { initialSfen: string | null; usiMoves: readonly string[] }): string | null {
  let initialSfen: string | null
  try {
    initialSfen = normalizeInitialSfen(kifu.initialSfen)
  } catch {
    return null
  }

  const bytes: number[] = []
  if (initialSfen === null) {
    bytes.push(KIFU_URL_VERSION)
  } else {
    // SFEN は ASCII だけ。正規化した形なら最長でも 255 文字に収まるが、念のため確かめる
    if (initialSfen.length > 255 || !/^[\x20-\x7e]+$/.test(initialSfen)) return null
    bytes.push(KIFU_URL_VERSION_WITH_POSITION, initialSfen.length)
    for (let i = 0; i < initialSfen.length; i++) bytes.push(initialSfen.charCodeAt(i))
  }
  if (!encodeMoves(kifu.usiMoves, bytes)) return null
  return bytesToBase64Url(bytes)
}

/**
 * `k` の値を対局に戻す。読めなければ null（エラーで止めずに案内へ落とすため）。
 * v2 の開始局面は検証してから返す（壊れた SFEN は null）。手順の合法性は見ない
 * （呼び出し側で replayUsiMoves する）。
 */
export function decodeKifuParam(param: string | null | undefined): SharedKifu | null {
  if (typeof param !== 'string' || param === '') return null
  const bytes = base64UrlToBytes(param)
  if (!bytes || bytes.length === 0) return null

  if (bytes[0] === KIFU_URL_VERSION) {
    const usiMoves = decodeMoves(bytes, 1)
    return usiMoves ? { initialSfen: null, usiMoves } : null
  }

  if (bytes[0] === KIFU_URL_VERSION_WITH_POSITION) {
    const length = bytes[1]
    if (length === undefined || length === 0 || bytes.length < 2 + length) return null
    const sfen = String.fromCharCode(...bytes.slice(2, 2 + length))
    let initialSfen: string | null
    try {
      initialSfen = normalizeInitialSfen(sfen)
    } catch {
      return null
    }
    const usiMoves = decodeMoves(bytes, 2 + length)
    return usiMoves ? { initialSfen, usiMoves } : null
  }

  return null
}

/**
 * `m`（開いたときに表示する手数）を 0〜total に丸める。
 * 範囲外・数字でない・未指定はすべて最終手（total）。
 */
export function clampMoveIndex(raw: string | number | null | undefined, total: number): number {
  if (raw === null || raw === undefined || raw === '') return total
  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(value)) return total
  const index = Math.floor(value)
  if (index < 0 || index > total) return total
  return index
}
