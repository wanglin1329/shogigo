// SPDX-License-Identifier: GPL-3.0-only

// Contract between the game UI and the AI layer (docs/PLAN.md §5.2).
// The UI only talks to `ShogiAi`; which engine answers is an implementation
// detail of src/games/shogi/ai/.

import type { GameState, Move, Player } from '../core/engine'

export type AiLevelId =
  | 'novice'
  | 'easy'
  | 'medium'
  | 'hard'
  | 'super' // JS ai-worker
  | 'master'
  | 'great'
  | 'transcendent'
  | 'legendary1'
  | 'legendary2'
  | 'legendary3' // やねうら王

export interface AiRequest {
  level: AiLevelId
  /** Position the game started from; null = 平手. */
  initialSfen: string | null
  /** Every move from the start position (USI), i.e. the whole game so far. */
  usiMoves: readonly string[]
  /** Current position (== replay of initialSfen + usiMoves). */
  state: GameState
  aiSide: Player
}

export type AiResult =
  | { kind: 'move'; move: Move; usi: string; thinkingMs: number; engine: 'js' | 'yaneuraou'; fellBack: boolean }
  /** No legal move / engine resigned. */
  | { kind: 'resign'; thinkingMs: number }
  /** Engine declared an entering-king win (should not happen with NoEnteringKing; handled anyway). */
  | { kind: 'win'; thinkingMs: number }

export interface AiDiagnostics {
  /** 'sse42' | 'nosimd' once detected. */
  wasmVariant: string | null
  yaneuraouState: 'idle' | 'loading' | 'ready' | 'failed'
  lastError: string | null
}

export interface ShogiAi {
  /** Warm the HTTP cache for the wasm (idle time, no instantiation). */
  prefetch(): void
  /** Instantiate やねうら王 ahead of time when a yaneuraou level is selected. */
  warmup(level: AiLevelId): void
  /** Start of a new game: clears engine state (usinewgame, joseki). */
  newGame(): void
  /**
   * Think for the side to move. Rejects with an AbortError-named Error when
   * superseded by a later request or cancel(). The returned move is always
   * legal in `request.state` (checked with the core engine; an illegal engine
   * answer falls back to the JS 超級 level).
   */
  requestMove(request: AiRequest): Promise<AiResult>
  /** Invalidate the pending request (its result is discarded). */
  cancel(): void
  diagnostics(): AiDiagnostics
  dispose(): void
}
