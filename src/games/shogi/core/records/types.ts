// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2025~ Yuki Lab
// Copyright 2026 the shogi project contributors
// Modified 2026-09-27: modes are ai / online / bot (bot = COM fallback,
// grouped with online); records keep `initialSfen`; waza are plain ids given by
// the caller; saving is an upsert by game id; tsume and backup types dropped.

export type RecordPlayer = 'sente' | 'gote'

/** How the game was played. `bot` = COM game after the matchmaker found nobody. */
export type GameMode = 'ai' | 'online' | 'bot'

/** Tabs / summary buckets. `bot` games count under `online`. */
export type RecordMode = 'all' | 'ai' | 'online'

/** What a game mode hands over when a game has ended. */
export interface GameInput {
  /** Stable per game: saving the same id again updates that record. */
  id: string
  startedAt: number
  endedAt: number
  mode: GameMode
  /** The side the player had. */
  player: RecordPlayer
  /** null = draw (千日手 etc.). */
  winner: RecordPlayer | null
  /** checkmate / sennichite / perpetual_check / resign / timeout / disconnect … */
  reason: string
  /** Start position; null = 平手. */
  initialSfen: string | null
  /** USI moves from the start position, as the game ended. */
  moves: string[]
  /** 'AI' / 'COM' / the opponent's shown name. */
  opponentName: string
  /** AI level label (入門 … 伝説3), AI mode only. */
  aiLevel?: string | null
  /** Opponent's 段級位 label, only when it was visible to the player. */
  opponentRank?: string | null
  opponentRating?: number | null
  /** Waza the player showed; duplicates are dropped. */
  wazaIds?: readonly string[]
}

export interface GameRecord {
  id: string
  startedAt: number
  endedAt: number
  mode: GameMode
  player: RecordPlayer
  winner: RecordPlayer | null
  reason: string
  initialSfen: string | null
  moves: string[]
  opponentName: string
  aiLevel?: string
  opponentRank?: string
  opponentRating?: number
  wazaIds: string[]
}

export interface Counts {
  games: number
  wins: number
  losses: number
  draws: number
  /** Denominator of the win rate: excludes draws. */
  eligible: number
}

export interface Summary extends Counts {
  /** Counts of the games in which each waza appeared. */
  waza: Record<string, Counts>
}

export interface GameCursor {
  endedAt: number
  id: string
}

export interface GamesQuery {
  mode?: RecordMode
  wazaId?: string
  limit?: number
  cursor?: GameCursor | null
}

export interface GamesPage {
  games: GameRecord[]
  nextCursor: GameCursor | null
}

/** Result of saving a finished game; the UI offers 「再試行」 on 'failed'. */
export type SaveStatus =
  | { status: 'saved' } // new record
  | { status: 'updated' } // same game id saved again (e.g. undo after the end, then a new ending)
  | { status: 'unchanged' } // identical record already stored
  | { status: 'unavailable' } // no IndexedDB (private mode, old browser, SSR)
  | { status: 'failed'; message: string }
