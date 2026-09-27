// SPDX-License-Identifier: GPL-3.0-only

// Minimal USI move parsing for engine answers (the full kifu module lives in
// core/kifu; this layer only needs "engine string → Move").

import type { BasePieceType, Move } from '../core/engine'

const DROP_PIECES: Record<string, BasePieceType> = {
  P: 'FU',
  L: 'KY',
  N: 'KE',
  S: 'GI',
  G: 'KI',
  B: 'KA',
  R: 'HI',
}

function square(file: string, rank: string): { x: number; y: number } | null {
  const f = file.charCodeAt(0) - 48 // '1'..'9'
  const r = rank.charCodeAt(0) - 97 // 'a'..'i'
  if (f < 1 || f > 9 || r < 0 || r > 8) return null
  return { x: 9 - f, y: r }
}

/** "7g7f", "8h2b+", "P*5e" → Move; anything else → null. */
export function parseUsiMove(usi: string): Move | null {
  if (/^[PLNSGBR]\*[1-9][a-i]$/.test(usi)) {
    const to = square(usi[2], usi[3])
    return to ? { type: 'drop', pieceType: DROP_PIECES[usi[0]], toX: to.x, toY: to.y } : null
  }
  if (/^[1-9][a-i][1-9][a-i]\+?$/.test(usi)) {
    const from = square(usi[0], usi[1])
    const to = square(usi[2], usi[3])
    if (!from || !to) return null
    return { type: 'move', fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, promote: usi.length === 5 }
  }
  return null
}
