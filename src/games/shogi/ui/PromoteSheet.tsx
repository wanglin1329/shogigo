// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef } from 'react'

import { pieceInfo } from '../core/engine'
import type { PieceType } from '../core/engine'
import { PIECE_NAME, Piece } from './Piece'
import type { PieceStyle } from './settings'

/**
 * 成り／不成 choice shown beside the destination square (docs/PLAN.md §5.4 ★).
 * Positions are in board-screen cells (0–8), so it follows the board's flip.
 * Both faces are drawn upright: it is always the player's own piece.
 */
export function PromoteSheet({
  type,
  at,
  pieceStyle,
  onChoose,
  onCancel,
}: {
  type: PieceType
  /** Destination square in screen coordinates (row/col after flipping). */
  at: { row: number; col: number }
  pieceStyle: PieceStyle
  onChoose: (promote: boolean) => void
  onCancel: () => void
}) {
  const first = useRef<HTMLButtonElement>(null)
  const cancel = useRef(onCancel)
  cancel.current = onCancel
  const promoted = pieceInfo[type].promoted!

  // Mount only: re-running on every parent render would pull focus back here.
  useEffect(() => {
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Open toward the board centre so the sheet never leaves the board.
  const WIDTH = 2.6 // in cells, matches .promote-sheet
  const left = Math.min(Math.max(at.col + 0.5 - WIDTH / 2, 0), 9 - WIDTH)
  const top = at.row <= 4 ? at.row + 1 : at.row - 1.7

  return (
    <div className="promote-layer" onClick={onCancel}>
      <div
        className="promote-sheet"
        role="dialog"
        aria-label="成りますか"
        style={{ left: `${(left / 9) * 100}%`, top: `${(top / 9) * 100}%` }}
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={first} type="button" className="promote-choice" onClick={() => onChoose(true)} aria-label={`成る（${PIECE_NAME[promoted]}）`}>
          <Piece type={promoted} owner="sente" style={pieceStyle} />
          <span className="promote-caption">成る</span>
        </button>
        <button type="button" className="promote-choice" onClick={() => onChoose(false)} aria-label={`成らない（${PIECE_NAME[type]}のまま）`}>
          <Piece type={type} owner="sente" style={pieceStyle} />
          <span className="promote-caption">成らない</span>
        </button>
      </div>
    </div>
  )
}
