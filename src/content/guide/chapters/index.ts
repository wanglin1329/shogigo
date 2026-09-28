// SPDX-License-Identifier: GPL-3.0-only

import type { Chapter } from '../types'
import { boardAndPieces } from './01-board-and-pieces'
import { pieceMoves } from './02-piece-moves'
import { promotion } from './03-promotion'
import { drops } from './04-drops'
import { checkAndMate } from './05-check-and-mate'
import { fouls } from './06-fouls'
import { sennichiteJishogi } from './07-sennichite-jishogi'
import { kifuNotation } from './08-kifu-notation'

/** The rules guide, in reading order. */
export const CHAPTERS: readonly Chapter[] = [
  boardAndPieces,
  pieceMoves,
  promotion,
  drops,
  checkAndMate,
  fouls,
  sennichiteJishogi,
  kifuNotation,
]

export function getChapter(slug: string): Chapter | undefined {
  return CHAPTERS.find((c) => c.slug === slug)
}

export function neighbours(slug: string): { prev?: Chapter; next?: Chapter } {
  const i = CHAPTERS.findIndex((c) => c.slug === slug)
  return { prev: CHAPTERS[i - 1], next: CHAPTERS[i + 1] }
}
