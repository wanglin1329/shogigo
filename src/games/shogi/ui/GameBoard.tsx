// SPDX-License-Identifier: GPL-3.0-only

import { useMemo } from 'react'
import type { ReactNode } from 'react'

import { findKing, getOpponent } from '../core/engine'
import type { GameState, Player } from '../core/engine'
import { checkingPieces } from '../core/hints'
import type { Square } from '../core/hints'
import { Board } from './Board'
import type { MoveAnimation } from './Board'
import { Hand } from './Hand'
import { Piece } from './Piece'
import { PromoteSheet } from './PromoteSheet'
import type { PieceStyle } from './settings'
import type { BoardInput } from './useBoardInput'

/**
 * Hands + board + everything drawn on top of them, shared by all game modes.
 * The mode decides who may move (`input`) and what the trays are called.
 */
export function GameBoard({
  state,
  input,
  interactive,
  flipped,
  pieceStyle,
  moveHints,
  label,
  lastMove,
  animation,
  showCheckLine,
  overlay,
  children,
}: {
  state: GameState
  input: BoardInput
  interactive: boolean
  flipped: boolean
  pieceStyle: PieceStyle
  moveHints: boolean
  /** Tray caption, e.g. 「あなた」「AI」「先手」. */
  label: (side: Player) => ReactNode
  lastMove: Square | null
  animation: MoveAnimation | null
  /** The check line fades after a move; the mode decides when to show it. */
  showCheckLine: boolean
  /** Extra layer inside the grid (e.g. the first-move demo); the promotion sheet wins. */
  overlay?: ReactNode
  /** Things floating over the board (thinking indicator, badges). */
  children?: ReactNode
}) {
  const check = useMemo(() => {
    if (!state.isCheck || !moveHints) return { cells: [] as Square[], line: null as { from: Square; to: Square } | null }
    const king = findKing(state.currentPlayer, state.board)
    const attackers = checkingPieces(state.currentPlayer, state.board)
    const far = king ? attackers.find((a) => Math.max(Math.abs(a.x - king.x), Math.abs(a.y - king.y)) >= 2) : undefined
    return { cells: [...attackers, ...(king ? [king] : [])], line: king && far ? { from: far, to: king } : null }
  }, [state, moveHints])

  const topSide: Player = flipped ? 'sente' : 'gote'
  const bottomSide = getOpponent(topSide)
  const selectedHand = input.selection?.kind === 'hand' ? input.selection.type : null
  const promotionPiece = input.promotion ? state.board[input.promotion.from.y][input.promotion.from.x] : null
  const promotionAt = input.promotion
    ? flipped
      ? { row: 8 - input.promotion.to.y, col: 8 - input.promotion.to.x }
      : { row: input.promotion.to.y, col: input.promotion.to.x }
    : null

  const hand = (side: Player) => (
    <Hand
      owner={side}
      label={String(label(side))}
      pieces={state.capturedPieces[side]}
      active={state.currentPlayer === side}
      selected={state.currentPlayer === side ? selectedHand : null}
      droppable={interactive && state.currentPlayer === side}
      pieceStyle={pieceStyle}
      onSelect={input.selectHand}
      onPiecePointerDown={input.armHand}
    />
  )

  const ghostPiece = input.ghost
    ? input.ghost.source.kind === 'board'
      ? state.board[input.ghost.source.square.y][input.ghost.source.square.x]
      : { type: input.ghost.source.type, owner: state.currentPlayer }
    : null

  return (
    <div className="board-area">
      {hand(topSide)}
      <div className="board-stage">
        <Board
          board={state.board}
          flipped={flipped}
          pieceStyle={pieceStyle}
          selected={input.selection?.kind === 'board' ? input.selection.square : null}
          targets={input.targets}
          movable={input.movable}
          lastMove={lastMove}
          checkCells={check.cells}
          checkLine={showCheckLine ? check.line : null}
          hintCells={input.hint?.cells ?? []}
          shake={input.shake}
          animation={animation}
          interactive={interactive}
          overlay={
            promotionPiece && promotionAt ? (
              <PromoteSheet
                type={promotionPiece.type}
                at={promotionAt}
                pieceStyle={pieceStyle}
                onChoose={input.choosePromotion}
                onCancel={input.cancelPromotion}
              />
            ) : (
              overlay
            )
          }
          onSquare={input.onSquare}
          onPiecePointerDown={input.armBoard}
        />
        {children}
        {input.hint && (
          <div
            className="move-hint"
            style={{ top: `calc(16px + ${hintRow(input.hint.cells, flipped)} * var(--cell))` }}
            role="status"
            aria-live="polite"
            key={input.hint.id}
          >
            {input.hint.text}
          </div>
        )}
      </div>
      {hand(bottomSide)}
      {input.ghost && ghostPiece && (
        <div className="drag-ghost" style={{ left: input.ghost.x, top: input.ghost.y }} aria-hidden="true">
          <Piece type={ghostPiece.type} owner={ghostPiece.owner} style={pieceStyle} flipped={flipped} />
        </div>
      )}
    </div>
  )
}

/**
 * Screen row (in cells, fractional) for the hint bubble: the middle of the
 * longest run of rows that holds none of the squares it talks about.
 */
function hintRow(cells: readonly Square[], flipped: boolean): number {
  const busy = new Set(cells.map((c) => (flipped ? 8 - c.y : c.y)))
  let best = { start: 0, length: 0 }
  let start = 0
  for (let row = 0; row <= 9; row++) {
    if (row === 9 || busy.has(row)) {
      if (row - start > best.length) best = { start, length: row - start }
      start = row + 1
    }
  }
  return best.length === 0 ? 4.5 : best.start + best.length / 2
}
