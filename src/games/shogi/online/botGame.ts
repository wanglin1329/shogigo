// SPDX-License-Identifier: GPL-3.0-only

// COM game offered when matchmaking finds nobody (docs/PLAN.md §6.2). It runs
// entirely in the browser; the server only receives the result once, with
// the signed ticket (POST /api/bot-result — a win must carry the kifu, which
// the server replays and checks ends in checkmate).
//
// The state is exposed as a server-shaped MatchPayload (room code 'LOCAL'),
// so the online game view renders COM and human games the same way.
// Timing follows upstream online-match.js: 30 s per move, the first move gets
// the server's 5 s start buffer, the COM waits 700 ms before thinking, and
// the flag falls 1 s after the deadline (the server's FLAG_GRACE_MS).

import { useEffect, useMemo, useSyncExternalStore } from 'react'

import { createShogiAi } from '../ai'
import { getAiLevel } from '../ai/levels'
import type { AiLevelId, ShogiAi } from '../ai/types'
import { getOpponent } from '../core/engine'
import type { GameState, Move, Player } from '../core/engine'
import { currentState, openRecord, play } from '../core/record'
import type { GameView } from '../core/record'
import { toPublicState } from '../server/protocol'
import type { BotResultResponse, MatchPayload, Winner } from '../server/protocol'
import * as api from './api'
import type { Failure } from './api'
import { COM_NAME } from './identity'
import { Store, systemClock } from './store'
import type { Clock } from './store'
import { markOnlinePlayed } from './unlock'

export const BOT_ROOM_CODE = 'LOCAL'
export const BOT_TC_SECONDS = 30
export const BOT_START_BUFFER_MS = 5_000
export const COM_MOVE_DELAY_MS = 700
export const BOT_FLAG_GRACE_MS = 1_000

export type BotResultReason = 'checkmate' | 'sennichite' | 'perpetual_check' | 'resign' | 'timeout' | 'disconnect'

export interface BotGameOptions {
  /** Ticket from the matchmaker's `bot` message; null = the game is not rated. */
  ticket: string | null
  /** The player's AI-mode level. やねうら王 levels play as 超級 (like upstream). */
  level: AiLevelId
  playerName: string | null
  /** The player's own rank index (shown on their side only), or null. */
  playerRank: number | null
  hideRank: boolean
}

export type BotReport =
  | { status: 'none' } // no ticket: nothing to report
  | { status: 'pending' } // game still running
  | { status: 'sending' }
  | { status: 'done'; outcome: Extract<BotResultResponse, { ok: true }>['outcome'] }
  | { status: 'failed'; code: string }

export interface BotGameSnapshot {
  match: MatchPayload
  yourSide: Player
  /** Full position (histories included) for legal moves and notation. */
  position: GameState
  view: GameView
  /** The JS level the COM actually plays. */
  comLevel: AiLevelId
  thinking: boolean
  report: BotReport
}

export interface BotGameDeps {
  clock: Clock
  createAi: () => ShogiAi
  randomSide: () => Player
  api: Pick<typeof api, 'postBotResult'>
}

/** やねうら王 levels are rounded down to 超級, as upstream getStandardAiDifficulty does. */
export function comLevelFor(level: AiLevelId): AiLevelId {
  return getAiLevel(level).engine === 'yaneuraou' ? 'super' : level
}

function randomSide(): Player {
  const bytes = new Uint8Array(1)
  crypto.getRandomValues(bytes)
  return (bytes[0] & 1) === 1 ? 'sente' : 'gote'
}

const iso = (ms: number) => new Date(ms).toISOString()

export class BotGame extends Store<BotGameSnapshot> {
  private readonly deps: BotGameDeps
  private readonly options: BotGameOptions
  private readonly comSide: Player
  private ai: ShogiAi | null = null
  private generation = 0
  private comTimer: unknown = null
  private flagTimer: unknown = null
  private started = false

  constructor(options: BotGameOptions, deps: Partial<BotGameDeps> = {}) {
    const d: BotGameDeps = {
      clock: systemClock,
      createAi: () => createShogiAi(),
      randomSide,
      api,
      ...deps,
    }
    const yourSide = d.randomSide()
    const now = d.clock.now()
    const view = openRecord({ initialSfen: null, moves: [] })
    const comLevel = comLevelFor(options.level)
    const rank = options.hideRank ? null : options.playerRank
    super({
      match: {
        room_code: BOT_ROOM_CODE,
        created_at: iso(now),
        started_at: iso(now),
        ended_at: null,
        expires_at: iso(now + 24 * 3600_000),
        sente_joined: true,
        gote_joined: true,
        sente_name: yourSide === 'sente' ? options.playerName : COM_NAME,
        gote_name: yourSide === 'gote' ? options.playerName : COM_NAME,
        state: toPublicState(currentState(view)),
        revision: 0,
        game_over: false,
        winner: null,
        result_reason: null,
        disconnect_side: null,
        disconnect_deadline: null,
        side_pref: 'random',
        match_type: 'matchmaking',
        tc_type: 'per_move',
        tc_seconds: BOT_TC_SECONDS,
        sente_time_ms: null,
        gote_time_ms: null,
        turn_deadline: iso(now + BOT_START_BUFFER_MS + BOT_TC_SECONDS * 1000),
        server_now: iso(now),
        sente_rank: yourSide === 'sente' ? rank : null,
        gote_rank: yourSide === 'gote' ? rank : null,
        sente_rank_visible: yourSide === 'sente' && rank !== null,
        gote_rank_visible: yourSide === 'gote' && rank !== null,
        sente_rating: null,
        gote_rating: null,
        sente_rating_delta: null,
        gote_rating_delta: null,
        sente_promoted: null,
        gote_promoted: null,
      },
      yourSide,
      position: currentState(view),
      view,
      comLevel,
      thinking: false,
      report: options.ticket ? { status: 'pending' } : { status: 'none' },
    })
    this.deps = d
    this.options = options
    this.comSide = getOpponent(yourSide)
  }

  start(): void {
    if (this.started || this.get().match.game_over) return
    this.started = true
    this.ai = this.deps.createAi()
    this.ai.newGame()
    this.armFlag()
    if (this.get().position.currentPlayer === this.comSide) this.scheduleCom()
  }

  /** The player's move. Returns false when it is not allowed right now. */
  playMove(move: Move): boolean {
    const snap = this.get()
    if (snap.match.game_over || snap.position.currentPlayer !== snap.yourSide) return false
    let view: GameView
    try {
      view = play(snap.view, move)
    } catch {
      return false
    }
    this.afterPly(view)
    return true
  }

  resign(): void {
    if (this.get().match.game_over) return
    this.end(this.comSide, 'resign')
  }

  /** Stops the COM and timers. `start()` may resume it (React StrictMode remounts effects). */
  dispose(): void {
    this.generation++
    this.clearTimers()
    this.ai?.dispose()
    this.ai = null
    this.started = false
  }

  // ------------------------------------------------------------ flow

  private afterPly(view: GameView): void {
    const now = this.deps.clock.now()
    const snap = this.get()
    const position = currentState(view)
    this.set({
      view,
      position,
      match: {
        ...snap.match,
        state: toPublicState(position),
        revision: snap.match.revision + 1,
        server_now: iso(now),
        turn_deadline: iso(now + BOT_TC_SECONDS * 1000),
      },
    })
    if (view.outcome) {
      const { winner, reason } = view.outcome
      this.end(winner, reason as BotResultReason)
      return
    }
    this.armFlag()
    if (position.currentPlayer === this.comSide) this.scheduleCom()
  }

  private armFlag(): void {
    if (this.flagTimer !== null) this.deps.clock.clearTimeout(this.flagTimer)
    const { match, position } = this.get()
    const deadline = match.turn_deadline ? Date.parse(match.turn_deadline) : NaN
    if (!Number.isFinite(deadline)) return
    const mover = position.currentPlayer
    const plies = match.state.usiMoveHistory.length
    this.flagTimer = this.deps.clock.setTimeout(
      () => {
        this.flagTimer = null
        const now = this.get()
        if (now.match.game_over || now.match.state.usiMoveHistory.length !== plies) return
        this.end(getOpponent(mover), 'timeout')
      },
      Math.max(0, deadline - this.deps.clock.now()) + BOT_FLAG_GRACE_MS,
    )
  }

  private scheduleCom(): void {
    if (this.comTimer !== null) this.deps.clock.clearTimeout(this.comTimer)
    this.comTimer = this.deps.clock.setTimeout(() => {
      this.comTimer = null
      void this.requestCom()
    }, COM_MOVE_DELAY_MS)
  }

  private async requestCom(): Promise<void> {
    const snap = this.get()
    if (!this.ai || snap.match.game_over || snap.position.currentPlayer !== this.comSide) return
    const gen = ++this.generation
    this.set({ thinking: true })
    try {
      const result = await this.ai.requestMove({
        level: snap.comLevel,
        initialSfen: null,
        usiMoves: snap.view.record.moves,
        state: snap.position,
        aiSide: this.comSide,
      })
      if (gen !== this.generation || this.get().match.game_over) return
      this.set({ thinking: false })
      if (result.kind === 'move') {
        // The adapter already validated the move against the core engine.
        this.afterPly(play(this.get().view, result.move))
      } else if (result.kind === 'resign') {
        // No legal move: the player has mated the COM.
        this.end(this.get().yourSide, 'checkmate')
      } else {
        // An entering-king declaration by the engine (not produced by the JS levels the COM uses).
        this.end(this.comSide, 'checkmate')
      }
    } catch (error) {
      if (gen !== this.generation || (error instanceof Error && error.name === 'AbortError')) return
      // No engine could answer: the COM "disconnected", the player wins (upstream does the same).
      this.set({ thinking: false })
      this.end(this.get().yourSide, 'disconnect')
    }
  }

  private end(winner: Winner, reason: BotResultReason): void {
    const snap = this.get()
    if (snap.match.game_over) return
    this.generation++
    this.clearTimers()
    this.ai?.cancel()
    const now = this.deps.clock.now()
    this.set({
      thinking: false,
      match: {
        ...snap.match,
        game_over: true,
        winner: winner ?? 'draw',
        result_reason: reason,
        ended_at: iso(now),
        turn_deadline: null,
        server_now: iso(now),
        revision: snap.match.revision + 1,
      },
    })
    markOnlinePlayed()
    void this.report(winner ?? 'draw')
  }

  /** Report the result once. Losses and draws are self-reported; a win carries the kifu. */
  private async report(winner: Winner): Promise<void> {
    const ticket = this.options.ticket
    if (!ticket) return
    const { yourSide, view, comLevel } = this.get()
    const result = winner === yourSide ? 'win' : winner === this.comSide ? 'lose' : 'draw'
    this.set({ report: { status: 'sending' } })
    const res: BotResultResponse | Failure = await this.deps.api.postBotResult({
      ticket,
      side: yourSide,
      result,
      difficulty: comLevel,
      ...(result === 'win' ? { moves: [...view.record.moves] } : {}),
    })
    this.set({ report: res.ok ? { status: 'done', outcome: res.outcome } : { status: 'failed', code: res.error.code } })
  }

  private clearTimers(): void {
    if (this.comTimer !== null) this.deps.clock.clearTimeout(this.comTimer)
    if (this.flagTimer !== null) this.deps.clock.clearTimeout(this.flagTimer)
    this.comTimer = null
    this.flagTimer = null
  }
}

/**
 * React binding: a COM game while `options` is non-null. A new options
 * object (new ticket) starts a new game.
 */
export function useBotGame(options: BotGameOptions | null) {
  const game = useMemo(() => (options ? new BotGame(options) : null), [options])
  useEffect(() => {
    if (!game) return
    game.start()
    return () => game.dispose()
  }, [game])
  const snapshot = useSyncExternalStore(
    game ? game.subscribe : noopSubscribe,
    game ? game.get : nullSnapshot,
    game ? game.get : nullSnapshot,
  )
  return {
    snapshot,
    playMove: (move: Move) => game?.playMove(move) ?? false,
    resign: () => game?.resign(),
  }
}

const noopSubscribe = () => () => {}
const nullSnapshot = () => null
