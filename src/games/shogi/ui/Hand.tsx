// SPDX-License-Identifier: GPL-3.0-only

import type { PointerEvent } from 'react'

import { CAPTURED_ORDER } from '../core/engine'
import type { BasePieceType, Captured, Player } from '../core/engine'
import { PIECE_NAME, Piece } from './Piece'
import type { PieceStyle } from './settings'

export function Hand({
  owner,
  label,
  pieces,
  active,
  selected,
  droppable,
  pieceStyle,
  onSelect,
  onPiecePointerDown,
}: {
  owner: Player
  /** Shown on the tray, e.g. 「あなた」「AI」「先手」. */
  label: string
  pieces: Captured
  /** Side to move: its tray is highlighted. */
  active: boolean
  selected: BasePieceType | null
  /** Whether this tray can be used right now (human's turn). */
  droppable: boolean
  pieceStyle: PieceStyle
  onSelect: (type: BasePieceType) => void
  onPiecePointerDown: (type: BasePieceType, event: PointerEvent<HTMLButtonElement>) => void
}) {
  const held = CAPTURED_ORDER.filter((t) => pieces[t] > 0)
  const side = owner === 'sente' ? '先手' : '後手'
  return (
    <div className={`hand ${active ? 'hand-active' : ''}`} role="group" aria-label={`${label}（${side}）の持ち駒`}>
      <span className="hand-label">{label}</span>
      <div className="hand-pieces" role="list">
        {held.length === 0 && <span className="hand-empty">なし</span>}
        {held.map((type) => (
          <button
            key={type}
            type="button"
            role="listitem"
            className={`hand-piece ${selected === type ? 'hand-selected' : ''}`}
            disabled={!droppable}
            aria-pressed={selected === type}
            aria-label={`${PIECE_NAME[type]} ${pieces[type]}枚`}
            onClick={() => onSelect(type)}
            onPointerDown={droppable ? (e) => onPiecePointerDown(type, e) : undefined}
          >
            <Piece type={type} owner="sente" style={pieceStyle} />
            {pieces[type] > 1 && <span className="hand-count">{pieces[type]}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
