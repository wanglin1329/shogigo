// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2025~ Yuki Lab
// Copyright 2026 the shogi project contributors
// Modified 2026-09-27: games may start from any position (initialSfen, docs/PLAN.md §2.4);
// reuse of a previous result also requires the same initial position.

// 指し手の並びから、局面の並びを組み立て直す。
// 棋譜の表示・共有URL・KIF読み込み・遊びかけの対局の復元が全部ここを通る。
// ルールは core/engine をそのまま使う（将棋のルールを二重に書かない）。

import {
  applyMove,
  getBoardHash,
  type ApplyResult,
  type Board,
  type CapturedPieces,
  type GameState,
  type Player,
} from '../engine'
import { parseUsiMove } from './moves'
import { createGameState, normalizeInitialSfen } from './sfen'

/** 1局面ぶん */
export type ReplayState = {
  board: Board
  capturedPieces: CapturedPieces
  currentPlayer: Player
  lastMove: { x: number; y: number } | null
  moveCount: number
  gameOver: boolean
  isCheck: boolean
}

export type ReplayResult = {
  /** 全部の手を並べ切れたか。false でも、そこまでの局面は使える */
  ok: boolean
  /** 開始局面（normalizeInitialSfen 済み。平手は null） */
  initialSfen: string | null
  /** 最終局面の内部状態。同じ手順の続きを並べるとき（1手指した直後）に使い回す */
  state: GameState
  /** 局面の並び。states[0] は開始局面なので、長さは usiMoves.length + 1 */
  states: ReplayState[]
  /** 千日手判定用 */
  positionHistory: string[]
  checkHistory: boolean[]
  /** 実際に並べられた手 */
  usiMoves: string[]
  gameOver: boolean
  winner: ApplyResult['winner']
  resultReason: ApplyResult['resultReason']
  /** 失敗した手の番号（0始まり）と理由。成功時は null */
  failedAt: number | null
  reason: string | null
}

function toReplayState(state: GameState, gameOver: boolean): ReplayState {
  return {
    board: state.board,
    capturedPieces: state.capturedPieces,
    currentPlayer: state.currentPlayer,
    lastMove: state.lastMove ? { ...state.lastMove } : null,
    moveCount: state.moveCount,
    gameOver,
    isCheck: state.isCheck,
  }
}

/** previous が同じ開始局面で、その手順が usiMoves の先頭とそっくり同じなら、続きから並べられる */
function canContinueFrom(
  previous: ReplayResult | undefined,
  initialSfen: string | null,
  usiMoves: readonly string[],
): previous is ReplayResult {
  if (!previous || !previous.ok) return false
  if (previous.initialSfen !== initialSfen) return false
  if (previous.usiMoves.length > usiMoves.length) return false
  return previous.usiMoves.every((move, i) => move === usiMoves[i])
}

/**
 * 開始局面から USI の手順を並べ直す。非合法手や読めない手に当たったら、そこで止めて
 * failedAt / reason を返す（手順については例外を投げない）。
 *
 * initialSfen は検証済みであること（外から来た文字列は normalizeInitialSfen /
 * parseSfen を通してから渡す）。壊れた initialSfen は SfenError を投げる。
 *
 * previous に前回の結果を渡すと、共通の頭の部分は並べ直さずに続きだけ足す。
 * 1手指すたびに全手数を並べ直すと、終盤ほど指したときの反応が鈍るため。
 */
export function replayUsiMoves(
  initialSfen: string | null,
  usiMoves: readonly string[],
  previous?: ReplayResult,
): ReplayResult {
  const start = normalizeInitialSfen(initialSfen)
  const continued = canContinueFrom(previous, start, usiMoves)
  const fresh = continued ? null : createGameState(start)
  let state = continued ? previous.state : fresh!
  const states: ReplayState[] = continued ? previous.states.slice() : [toReplayState(fresh!, false)]
  const accepted: string[] = continued ? previous.usiMoves.slice() : []
  let gameOver = continued ? previous.gameOver : false
  let winner: ApplyResult['winner'] = continued ? previous.winner : null
  let resultReason: ApplyResult['resultReason'] = continued ? previous.resultReason : null

  const failure = (i: number, reason: string): ReplayResult => ({
    ok: false,
    initialSfen: start,
    state,
    states,
    positionHistory: [...state.positionHistory],
    checkHistory: [...state.checkHistory],
    usiMoves: accepted,
    gameOver,
    winner,
    resultReason,
    failedAt: i,
    reason,
  })

  for (let i = accepted.length; i < usiMoves.length; i++) {
    const move = parseUsiMove(usiMoves[i])
    if (!move) return failure(i, 'bad_move_format')
    let result: ApplyResult
    try {
      result = applyMove(state, move)
    } catch (error) {
      return failure(i, error instanceof Error ? error.message : 'illegal_move')
    }
    state = result.state
    gameOver = result.gameOver
    winner = result.winner
    resultReason = result.resultReason
    accepted.push(state.usiMoveHistory[state.usiMoveHistory.length - 1])
    // 終局した手だけ gameOver を立てる
    states.push(toReplayState(state, gameOver))
  }

  return {
    ok: true,
    initialSfen: start,
    state,
    states,
    positionHistory: [...state.positionHistory],
    checkHistory: [...state.checkHistory],
    usiMoves: accepted,
    gameOver,
    winner,
    resultReason,
    failedAt: null,
    reason: null,
  }
}

/** 開始局面のハッシュ（positionHistory[0] と同じ文字列） */
export function initialPositionHash(initialSfen: string | null = null): string {
  const state = createGameState(normalizeInitialSfen(initialSfen))
  return getBoardHash(state.board, state.capturedPieces, state.currentPlayer)
}
