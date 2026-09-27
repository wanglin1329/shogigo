// SPDX-License-Identifier: GPL-3.0-only

// Rule questions the UI asks that the engine does not answer directly:
// promotion choices, which pieces attack a square, and *why* a selected piece
// or a chosen target is not allowed (docs/PLAN.md §5.3-4). Pure functions.

import {
  PIECE_MOVEMENTS,
  calculateDropLocations,
  calculateValidMoves,
  cloneBoard,
  findKing,
  getOpponent,
  isInPromotionZone,
  pieceInfo,
} from './engine'
import type { BasePieceType, Board, GameState, Piece, Player } from './engine'

export interface Square {
  x: number
  y: number
}

// ---------------------------------------------------------------- promotion

/** Promotion is possible when the move starts or ends in the enemy camp. */
export function canPromote(piece: Piece, fromY: number, toY: number): boolean {
  return (
    pieceInfo[piece.type].canPromote &&
    (isInPromotionZone(piece.owner, fromY) || isInPromotionZone(piece.owner, toY))
  )
}

/** A pawn/lance on the last rank or a knight on the last two ranks must promote. */
export function mustPromote(piece: Piece, toY: number): boolean {
  const lastRank = piece.owner === 'sente' ? 0 : 8
  if (piece.type === 'FU' || piece.type === 'KY') return toY === lastRank
  if (piece.type === 'KE') return piece.owner === 'sente' ? toY <= 1 : toY >= 7
  return false
}

// ---------------------------------------------------------------- attacks

/** Squares a piece reaches, ignoring whether its own king is left in check. */
function reach(x: number, y: number, piece: Piece, board: Board): Square[] {
  const out: Square[] = []
  for (const dir of PIECE_MOVEMENTS[piece.owner][piece.type] ?? []) {
    let cx = x
    let cy = y
    for (let i = 0; i < dir.range; i++) {
      cx += dir.dx
      cy += dir.dy
      if (cx < 0 || cx > 8 || cy < 0 || cy > 8) break
      out.push({ x: cx, y: cy })
      if (board[cy][cx]) break
    }
  }
  return out
}

/** Pieces of `attacker` that could capture on (x, y). */
export function attackersOf(x: number, y: number, attacker: Player, board: Board): Square[] {
  const found: Square[] = []
  for (let sy = 0; sy < 9; sy++) {
    for (let sx = 0; sx < 9; sx++) {
      const p = board[sy][sx]
      if (!p || p.owner !== attacker) continue
      if (reach(sx, sy, p, board).some((s) => s.x === x && s.y === y)) found.push({ x: sx, y: sy })
    }
  }
  return found
}

/** Enemy pieces currently giving check to `player`'s king. */
export function checkingPieces(player: Player, board: Board): Square[] {
  const king = findKing(player, board)
  return king ? attackersOf(king.x, king.y, getOpponent(player), board) : []
}

// ---------------------------------------------------------------- legality

export function legalTargets(state: GameState, from: Square): Square[] {
  const piece = state.board[from.y][from.x]
  if (!piece || piece.owner !== state.currentPlayer) return []
  return calculateValidMoves(from.x, from.y, piece, state.board)
}

export function legalDrops(state: GameState, type: BasePieceType): Square[] {
  if (state.capturedPieces[state.currentPlayer][type] <= 0) return []
  return calculateDropLocations(type, state.currentPlayer, state.board, state.capturedPieces)
}

/** Board squares holding a piece of the side to move that has a legal move. */
export function movablePieces(state: GameState): Square[] {
  const out: Square[] = []
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const p = state.board[y][x]
      if (p && p.owner === state.currentPlayer && legalTargets(state, { x, y }).length) out.push({ x, y })
    }
  }
  return out
}

// ---------------------------------------------------------------- explanations

/**
 * Why a selection or a target is refused. The UI turns this into a sentence and
 * highlights `cells`; `attacker` is the enemy piece responsible, if any.
 */
export type Refusal =
  | { kind: 'in_check'; attacker: Square | null; cells: Square[] } // 王手を防げない
  | { kind: 'pinned'; attacker: Square | null; cells: Square[] } // 動かすと玉を取られる
  | { kind: 'exposes_king'; attacker: Square | null; cells: Square[] } // そこへ動かすと玉を取られる
  | { kind: 'drop_in_check'; attacker: Square | null; cells: Square[] } // 打っても王手を防げない
  | { kind: 'nifu'; cells: Square[] } // 二歩
  | { kind: 'uchifuzume'; cells: Square[] } // 打ち歩詰め
  | { kind: 'no_future'; cells: Square[] } // 行き所のない駒
  | { kind: 'unreachable'; cells: Square[] } // その駒はそこへ動けない

function firstAttackerAfter(board: Board, player: Player): Square | null {
  return checkingPieces(player, board)[0] ?? null
}

/** Why the piece on `from` has no legal move (it has none: caller checked). */
export function explainNoMoves(state: GameState, from: Square): Refusal {
  const player = state.currentPlayer
  const piece = state.board[from.y][from.x]!
  const king = findKing(player, state.board)
  if (state.isCheck) {
    const attacker = checkingPieces(player, state.board)[0] ?? null
    return { kind: 'in_check', attacker, cells: [from, ...(attacker ? [attacker] : []), ...(king ? [king] : [])] }
  }
  // Not in check and no legal move: every pseudo move exposes the king → pinned.
  for (const to of reach(from.x, from.y, piece, state.board)) {
    const target = state.board[to.y][to.x]
    if (target && target.owner === player) continue
    const next = cloneBoard(state.board)
    next[to.y][to.x] = piece
    next[from.y][from.x] = null
    const attacker = firstAttackerAfter(next, player)
    if (attacker) return { kind: 'pinned', attacker, cells: [from, attacker, ...(king ? [king] : [])] }
  }
  return { kind: 'unreachable', cells: [from] }
}

/** Why moving the piece on `from` to `to` is refused. */
export function explainRejectedMove(state: GameState, from: Square, to: Square): Refusal {
  const player = state.currentPlayer
  const piece = state.board[from.y][from.x]!
  const reachable = reach(from.x, from.y, piece, state.board).some((s) => s.x === to.x && s.y === to.y)
  const target = state.board[to.y][to.x]
  if (!reachable || (target && target.owner === player)) return { kind: 'unreachable', cells: [to] }
  const next = cloneBoard(state.board)
  next[to.y][to.x] = piece
  next[from.y][from.x] = null
  const attacker = firstAttackerAfter(next, player)
  const king = findKing(player, next)
  const cells = [to, ...(attacker ? [attacker] : []), ...(king ? [king] : [])]
  return state.isCheck ? { kind: 'in_check', attacker, cells } : { kind: 'exposes_king', attacker, cells }
}

/** Why dropping `type` on `to` is refused. */
export function explainRejectedDrop(state: GameState, type: BasePieceType, to: Square): Refusal {
  const player = state.currentPlayer
  if (state.board[to.y][to.x]) return { kind: 'unreachable', cells: [to] }
  const lastRank = player === 'sente' ? 0 : 8
  if ((type === 'FU' || type === 'KY') && to.y === lastRank) return { kind: 'no_future', cells: [to] }
  if (type === 'KE' && (player === 'sente' ? to.y <= 1 : to.y >= 7)) return { kind: 'no_future', cells: [to] }
  if (type === 'FU') {
    for (let y = 0; y < 9; y++) {
      const p = state.board[y][to.x]
      if (p && p.owner === player && p.type === 'FU') return { kind: 'nifu', cells: [to, { x: to.x, y }] }
    }
  }
  const next = cloneBoard(state.board)
  next[to.y][to.x] = { type, owner: player }
  const attacker = firstAttackerAfter(next, player)
  if (attacker) {
    const king = findKing(player, next)
    return { kind: 'drop_in_check', attacker, cells: [to, attacker, ...(king ? [king] : [])] }
  }
  // Only 打ち歩詰め remains for a pawn that is otherwise placeable.
  return { kind: type === 'FU' ? 'uchifuzume' : 'unreachable', cells: [to] }
}

/** Why no square accepts a drop of the selected hand piece. */
export function explainNoDrops(state: GameState): Refusal {
  const player = state.currentPlayer
  if (!state.isCheck) return { kind: 'unreachable', cells: [] }
  const attacker = checkingPieces(player, state.board)[0] ?? null
  const king = findKing(player, state.board)
  return { kind: 'drop_in_check', attacker, cells: [...(attacker ? [attacker] : []), ...(king ? [king] : [])] }
}
