// SPDX-License-Identifier: GPL-3.0-only

import { useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'

import type { Board as BoardGrid } from '../core/engine'
import type { Square } from '../core/hints'
import { PIECE_NAME, Piece } from './Piece'
import type { PieceStyle } from './settings'

const FILE_LABEL = ['９', '８', '７', '６', '５', '４', '３', '２', '１'] // x = 0 … 8
const RANK_LABEL = ['一', '二', '三', '四', '五', '六', '七', '八', '九'] // y = 0 … 8

export function squareName({ x, y }: Square): string {
  return `${FILE_LABEL[x]}${RANK_LABEL[y]}`
}

const key = (s: Square) => `${s.x},${s.y}`
const has = (list: readonly Square[], x: number, y: number) => list.some((s) => s.x === x && s.y === y)

export interface MoveAnimation {
  from: Square | null // null = drop
  to: Square
  /** Changes on every new move so the same squares can animate twice. */
  id: number
}

export interface BoardProps {
  board: BoardGrid
  flipped: boolean
  pieceStyle: PieceStyle
  selected: Square | null
  targets: readonly Square[]
  movable: readonly Square[]
  lastMove: Square | null
  /** Check: attacking pieces and the king in check. */
  checkCells: readonly Square[]
  /** Straight line from a distant attacker to the king. */
  checkLine: { from: Square; to: Square } | null
  /** Squares explaining a refused move. */
  hintCells: readonly Square[]
  /** Square that just refused a move (shakes once). */
  shake: { square: Square; id: number } | null
  animation: MoveAnimation | null
  interactive: boolean
  /** Rendered inside the grid, so percentages map exactly onto squares. */
  overlay?: ReactNode
  onSquare: (square: Square) => void
  onPiecePointerDown: (square: Square, event: PointerEvent<HTMLButtonElement>) => void
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function Board(props: BoardProps) {
  const {
    board,
    flipped,
    pieceStyle,
    selected,
    targets,
    movable,
    lastMove,
    checkCells,
    checkLine,
    hintCells,
    shake,
    animation,
    interactive,
    overlay,
    onSquare,
    onPiecePointerDown,
  } = props
  const gridRef = useRef<HTMLDivElement>(null)
  const [focus, setFocus] = useState<Square>({ x: 4, y: 6 })

  // Display order: row/column on screen → board coordinates.
  const at = (row: number, col: number): Square => (flipped ? { x: 8 - col, y: 8 - row } : { x: col, y: row })
  const screenOf = (s: Square) => (flipped ? { row: 8 - s.y, col: 8 - s.x } : { row: s.y, col: s.x })

  // Slide the moved piece from its origin (FLIP). Drops fade in via CSS.
  useLayoutEffect(() => {
    if (!animation || reducedMotion()) return
    const grid = gridRef.current
    const target = grid?.querySelector<HTMLElement>(`[data-sq="${key(animation.to)}"] .piece`)
    if (!grid || !target) return
    if (!animation.from) {
      // `scale`/`translate` are independent of `transform`, which holds the
      // 180° rotation of 後手 pieces.
      target.animate([{ scale: '1.15', opacity: 0.4 }, { scale: '1', opacity: 1 }], {
        duration: 140,
        easing: 'ease-out',
      })
      return
    }
    const fromCell = grid.querySelector<HTMLElement>(`[data-sq="${key(animation.from)}"]`)
    const toCell = grid.querySelector<HTMLElement>(`[data-sq="${key(animation.to)}"]`)
    if (!fromCell || !toCell) return
    const a = fromCell.getBoundingClientRect()
    const b = toCell.getBoundingClientRect()
    target.animate(
      [{ translate: `${a.left - b.left}px ${a.top - b.top}px` }, { translate: '0 0' }],
      { duration: 140, easing: 'cubic-bezier(.2,.8,.3,1)' },
    )
  }, [animation])

  // Shake the refused square once per refusal.
  useLayoutEffect(() => {
    if (!shake || reducedMotion()) return
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-sq="${key(shake.square)}"]`)
      ?.animate(
        [{ translate: '0' }, { translate: '-3px' }, { translate: '3px' }, { translate: '-2px' }, { translate: '0' }],
        { duration: 260 },
      )
  }, [shake])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const { row, col } = screenOf(focus)
    const delta: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }
    const d = delta[event.key]
    if (!d) return
    event.preventDefault()
    const next = at(Math.min(8, Math.max(0, row + d[0])), Math.min(8, Math.max(0, col + d[1])))
    setFocus(next)
    gridRef.current?.querySelector<HTMLElement>(`[data-sq="${key(next)}"]`)?.focus()
  }

  const rows = Array.from({ length: 9 }, (_, r) => r)
  const lineFrom = checkLine && screenOf(checkLine.from)
  const lineTo = checkLine && screenOf(checkLine.to)

  return (
    <div className="board-frame">
      <div className="board-files" aria-hidden="true">
        {rows.map((c) => (
          <span key={c}>{FILE_LABEL[at(0, c).x]}</span>
        ))}
      </div>
      <div className="board-body">
        <div
          ref={gridRef}
          className={`board-grid ${interactive ? '' : 'board-waiting'}`}
          role="grid"
          aria-label="将棋盤"
          onKeyDown={onKeyDown}
        >
          {rows.map((row) => (
            <div role="row" className="board-row" key={row}>
              {rows.map((col) => {
                const sq = at(row, col)
                const piece = board[sq.y][sq.x]
                const isTarget = has(targets, sq.x, sq.y)
                const classes = [
                  'sq',
                  selected && selected.x === sq.x && selected.y === sq.y ? 'sq-selected' : '',
                  isTarget ? (piece ? 'sq-capture' : 'sq-target') : '',
                  !selected && has(movable, sq.x, sq.y) ? 'sq-movable' : '',
                  has(checkCells, sq.x, sq.y) ? 'sq-check' : '',
                  has(hintCells, sq.x, sq.y) ? 'sq-hint' : '',
                ].join(' ')
                const label = `${squareName(sq)} ${
                  piece ? `${piece.owner === 'sente' ? '先手' : '後手'}の${PIECE_NAME[piece.type]}` : '空き'
                }${isTarget ? '（移動できます）' : ''}`
                return (
                  <button
                    key={col}
                    type="button"
                    role="gridcell"
                    data-sq={key(sq)}
                    className={classes}
                    aria-label={label}
                    tabIndex={focus.x === sq.x && focus.y === sq.y ? 0 : -1}
                    onFocus={() => setFocus(sq)}
                    onClick={() => onSquare(sq)}
                    onPointerDown={piece && interactive ? (e) => onPiecePointerDown(sq, e) : undefined}
                  >
                    {piece && <Piece type={piece.type} owner={piece.owner} style={pieceStyle} flipped={flipped} />}
                    {lastMove && lastMove.x === sq.x && lastMove.y === sq.y && (
                      <span className="last-move" aria-hidden="true" />
                    )}
                  </button>
                )
              })}
            </div>
          ))}
          {lineFrom && lineTo && (
            <svg className="check-line" viewBox="0 0 9 9" aria-hidden="true" key={`${key(checkLine!.from)}>${key(checkLine!.to)}`}>
              <line x1={lineFrom.col + 0.5} y1={lineFrom.row + 0.5} x2={lineTo.col + 0.5} y2={lineTo.row + 0.5} />
            </svg>
          )}
          {overlay}
        </div>
        <div className="board-ranks" aria-hidden="true">
          {rows.map((r) => (
            <span key={r}>{RANK_LABEL[at(r, 0).y]}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
