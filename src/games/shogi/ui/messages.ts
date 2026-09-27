// SPDX-License-Identifier: GPL-3.0-only

import type { Board, PieceType } from '../core/engine'
import type { Refusal, Square } from '../core/hints'
import { PIECE_NAME } from './Piece'

function nameAt(board: Board, square: Square | null): string {
  const piece = square ? board[square.y][square.x] : null
  return piece ? PIECE_NAME[piece.type] : '相手の駒'
}

/**
 * One sentence for the move-hint bubble. `board` is the position in which
 * the refusal was computed; `moving` is the piece the player tried to move.
 */
export function refusalText(refusal: Refusal, board: Board, moving: PieceType | null): string | null {
  switch (refusal.kind) {
    case 'in_check':
      return '王手がかかっています。玉を逃げるか、王手を止める手を指しましょう'
    case 'pinned':
      return `この${moving ? PIECE_NAME[moving] : '駒'}が動くと、${nameAt(board, refusal.attacker)}に玉を取られてしまいます`
    case 'exposes_king':
      return `そのマスへ動くと、${nameAt(board, refusal.attacker)}に玉を取られてしまいます`
    case 'drop_in_check':
      return `そこに打っても、${nameAt(board, refusal.attacker)}の王手は止まりません`
    case 'nifu':
      return '同じ筋に歩を2枚置く「二歩」は反則です'
    case 'uchifuzume':
      return '歩を打って詰ませる「打ち歩詰め」は反則です'
    case 'no_future':
      return 'そこに打つと、その先へ一歩も動けない駒になってしまいます'
    case 'unreachable':
      // Tapping an unrelated square simply clears the selection: no bubble.
      return null
  }
}

export const RESULT_REASON: Record<string, string> = {
  checkmate: '詰み',
  sennichite: '千日手',
  perpetual_check: '連続王手の千日手',
  resign: '投了',
}
