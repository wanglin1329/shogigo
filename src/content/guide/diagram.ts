// SPDX-License-Identifier: GPL-3.0-only

// Board diagrams of the rules guide (docs/PLAN.md §9.7). Positions are
// written square by square in shogi notation ('76' = ７六), so a diagram can
// show an illegal position on purpose (二歩 …) — they are checked for shape
// only (test/core/guide.spec.ts), not by the rules engine.

import { PIECE_MOVEMENTS } from '../../games/shogi/core/engine'
import type { PieceType, Player } from '../../games/shogi/core/engine'

/** '55' → 玉 (先手), 'v王' (後手). Glyphs as on the game board. */
export type Pieces = Readonly<Record<string, string>>

export type MarkKind =
  /** Where the piece can go (a dot). */
  | 'move'
  /** A square to look at (tinted). */
  | 'target'
  /** Not allowed here (a cross). */
  | 'bad'

export interface Diagram {
  pieces: Pieces
  /** Visible part of the board, inclusive, in shogi numbers (files 9…1, ranks 1…9). Default: all. */
  crop?: { files: readonly [number, number]; ranks: readonly [number, number] }
  marks?: readonly { sq: string; kind: MarkKind }[]
  arrows?: readonly { from: string; to: string }[]
  /** Pieces in hand, as shown under the board: e.g. '金 歩2'. */
  hands?: { sente?: string; gote?: string }
  caption: string
  /** What the diagram shows, for screen readers and search engines. */
  alt: string
}

export const GLYPH_TYPE: Readonly<Record<string, PieceType>> = {
  玉: 'OU',
  王: 'OU',
  飛: 'HI',
  角: 'KA',
  金: 'KI',
  銀: 'GI',
  桂: 'KE',
  香: 'KY',
  歩: 'FU',
  龍: '+HI',
  馬: '+KA',
  全: '+GI',
  圭: '+KE',
  杏: '+KY',
  と: '+FU',
}

/** '76' → board coordinates (x = 0 is file 9, y = 0 is rank 一). */
export function square(sq: string): { x: number; y: number } {
  if (!/^[1-9][1-9]$/.test(sq)) throw new Error(`bad square: ${sq}`)
  return { x: 9 - Number(sq[0]), y: Number(sq[1]) - 1 }
}

export function squareName(x: number, y: number): string {
  return `${9 - x}${y + 1}`
}

/** A piece token → owner and type ('v' prefix = 後手). */
export function parseToken(token: string): { owner: Player; type: PieceType; glyph: string } {
  const gote = token.startsWith('v')
  const glyph = gote ? token.slice(1) : token
  const type = GLYPH_TYPE[glyph]
  if (!type || glyph.length !== 1) throw new Error(`bad piece: ${token}`)
  return { owner: gote ? 'gote' : 'sente', type, glyph }
}

/** The starting position (平手). */
export const INITIAL: Pieces = (() => {
  const back = ['香', '桂', '銀', '金', '玉', '金', '銀', '桂', '香']
  const p: Record<string, string> = {}
  back.forEach((glyph, i) => {
    const file = 9 - i
    p[`${file}9`] = glyph
    p[`${file}1`] = `v${glyph === '玉' ? '王' : glyph}`
    p[`${file}7`] = '歩'
    p[`${file}3`] = 'v歩'
  })
  p['88'] = '角'
  p['28'] = '飛'
  p['22'] = 'v角'
  p['82'] = 'v飛'
  return p
})()

/**
 * Squares the piece on `from` can move to, from the rules engine's movement
 * table: stops at the first piece in a line (includes it when it is the
 * opponent's). For the movement diagrams.
 */
export function reachable(pieces: Pieces, from: string): string[] {
  const { x, y } = square(from)
  const { owner, type } = parseToken(pieces[from])
  const out: string[] = []
  for (const dir of PIECE_MOVEMENTS[owner][type] ?? []) {
    for (let step = 1; step <= dir.range; step++) {
      const nx = x + dir.dx * step
      const ny = y + dir.dy * step
      if (nx < 0 || nx > 8 || ny < 0 || ny > 8) break
      const name = squareName(nx, ny)
      const there = pieces[name]
      if (there) {
        if (parseToken(there).owner !== owner) out.push(name)
        break
      }
      out.push(name)
    }
  }
  return out
}

/** reachable() as 'move' marks. */
export function moveMarks(pieces: Pieces, from: string) {
  return reachable(pieces, from).map((sq) => ({ sq, kind: 'move' as const }))
}
