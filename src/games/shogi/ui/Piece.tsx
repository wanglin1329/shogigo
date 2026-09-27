// SPDX-License-Identifier: GPL-3.0-only

import { PIECE_MOVEMENTS } from '../core/engine'
import type { PieceType, Player } from '../core/engine'
import type { PieceStyle } from './settings'

export const PIECE_GLYPH: Record<PieceType, string> = {
  OU: '玉',
  HI: '飛',
  KA: '角',
  KI: '金',
  GI: '銀',
  KE: '桂',
  KY: '香',
  FU: '歩',
  '+HI': '龍',
  '+KA': '馬',
  '+GI': '全',
  '+KE': '圭',
  '+KY': '杏',
  '+FU': 'と',
}

/** Full names used in sentences and aria labels. */
export const PIECE_NAME: Record<PieceType, string> = {
  OU: '玉',
  HI: '飛車',
  KA: '角',
  KI: '金',
  GI: '銀',
  KE: '桂馬',
  KY: '香車',
  FU: '歩',
  '+HI': '龍',
  '+KA': '馬',
  '+GI': '成銀',
  '+KE': '成桂',
  '+KY': '成香',
  '+FU': 'と金',
}

export function glyphFor(type: PieceType, owner: Player): string {
  // The traditional pair: 後手 holds 王, 先手 holds 玉.
  return type === 'OU' && owner === 'gote' ? '王' : PIECE_GLYPH[type]
}

/**
 * Movement guide: a 3×3 map of where the piece may go, drawn from the same
 * table the rules use (sente orientation; the piece itself is rotated for gote).
 */
function Guide({ type }: { type: PieceType }) {
  const dirs = PIECE_MOVEMENTS.sente[type] ?? []
  const knight = type === 'KE'
  return (
    <span className="piece-guide" aria-hidden="true">
      {dirs.map((d) => {
        // Knight jumps (dy = -2) are drawn in the top corners.
        const dy = knight ? -1 : d.dy
        const key = `${d.dx},${d.dy}`
        return (
          <span
            key={key}
            className={d.range > 1 ? 'guide-dot guide-far' : 'guide-dot'}
            style={{ gridColumn: d.dx + 2, gridRow: dy + 2 }}
          />
        )
      })}
    </span>
  )
}

export function Piece({
  type,
  owner,
  style,
  flipped = false,
  className = '',
}: {
  type: PieceType
  owner: Player
  style: PieceStyle
  /** Board seen from 後手's side: then 先手's pieces are the upside-down ones. */
  flipped?: boolean
  className?: string
}) {
  const promoted = type.startsWith('+')
  const facesAway = (owner === 'gote') !== flipped
  return (
    <span
      className={`piece ${facesAway ? 'piece-away' : ''} ${promoted ? 'piece-promoted' : ''} ${className}`}
      aria-hidden="true"
    >
      <span className="piece-glyph">{glyphFor(type, owner)}</span>
      {style === 'guide' && <Guide type={type} />}
    </span>
  )
}
