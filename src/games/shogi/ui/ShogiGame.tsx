// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  AI_LEVELS,
  DEFAULT_AI_LEVEL,
  getAiLevel,
  levelUnlockedByBeating,
  resolvePlayableLevel,
} from '../ai/levels'
import type { AiLevelId } from '../ai/types'
import { findKing, getOpponent } from '../core/engine'
import type { BasePieceType, Move, Player } from '../core/engine'
import {
  canPromote,
  checkingPieces,
  explainNoDrops,
  explainNoMoves,
  explainRejectedDrop,
  explainRejectedMove,
  legalDrops,
  legalTargets,
  movablePieces,
  mustPromote,
} from '../core/hints'
import type { Refusal, Square } from '../core/hints'
import { parseUsiMove } from '../core/kifu/moves'
import { decodeKifuParam } from '../core/kifu/url'
import { atEnd, currentState, openRecord, play, resign, seek, visibleOutcome } from '../core/record'
import type { GameView } from '../core/record'
import { readJson, writeJson } from '../../../site/storage'
import { Board } from './Board'
import type { MoveAnimation } from './Board'
import { playMoveSound, unlockAudio, vibrate } from './feedback'
import { FirstMoveDemo } from './FirstMoveDemo'
import { Hand } from './Hand'
import { KifuBar } from './KifuBar'
import { LevelPicker } from './LevelPicker'
import { refusalText } from './messages'
import { Piece } from './Piece'
import { PromoteSheet } from './PromoteSheet'
import { ResultDialog } from './ResultDialog'
import { SettingsDialog } from './SettingsDialog'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings'
import type { ShogiSettings } from './settings'
import { positionKey, useAiOpponent } from './useAiOpponent'
import { usePieceDrag } from './usePieceDrag'
import { EMPTY_RECORD, useShogiGame } from './useShogiGame'

type Selection = { kind: 'board'; square: Square } | { kind: 'hand'; type: BasePieceType }

interface Progress {
  /** Levels the player has beaten at least once (unlocks the next legendary level). */
  beaten: AiLevelId[]
  wins: number
  /** Games already counted: undoing a win and winning again is the same game. */
  counted: string[]
}

const COUNTED_KEEP = 30

function newGameId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
}

interface Flash {
  text: string
  tone: 'attack' | 'warn' | 'info'
  id: number
}

interface ResetUndo {
  view: GameView
  level: AiLevelId
  side: Player
  gameId: string
}

const DEMO_IDLE_MS = 6000
const DEMO_NEW_GAME_MS = 1000
const DEMO_DEAD_TAP_MS = 500
/** Two loops of the CSS animation (3.2 s each). */
const DEMO_SHOW_MS = 6400
const DEMO_MAX_SHOWS = 2
const HINT_MS = 4000
const CHECK_MS = 2400
const RESET_UNDO_MS = 10_000
const RESET_UNDO_MIN_PLIES = 3

let flashSeq = 0

/** A kifu opened from a share link (`/?k=…&m=…`), applied after hydration. */
export interface SharedKifuLink {
  k: string
  m: number | null
}

function clearShareParams() {
  if (location.search) history.replaceState(history.state, '', location.pathname)
}

export function ShogiGame({ shared = null }: { shared?: SharedKifuLink | null }) {
  const [review, setReview] = useState<{ plies: number } | null>(null)
  const { view, restored, update, reload } = useShogiGame('shogi.ai.game', !review)
  const [settings, setSettings] = useState<ShogiSettings>(DEFAULT_SETTINGS)
  const [progress, setProgress] = useState<Progress>({ beaten: [], wins: 0, counted: [] })
  const progressRef = useRef(progress)
  const gameId = useRef<string>('')
  const [level, setLevel] = useState<AiLevelId>(DEFAULT_AI_LEVEL)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null)
  const [hint, setHint] = useState<{ text: string; cells: Square[]; id: number } | null>(null)
  const [shake, setShake] = useState<{ square: Square; id: number } | null>(null)
  const [notice, setNotice] = useState<Flash | null>(null)
  const [checkLineVisible, setCheckLineVisible] = useState(false)
  const [resetUndo, setResetUndo] = useState<ResetUndo | null>(null)
  const [dialog, setDialog] = useState<'result' | 'settings' | 'level' | null>(null)
  const [pendingSide, setPendingSide] = useState<Player | null>(null)
  const [kifuOpen, setKifuOpen] = useState(false)
  const [confirmResign, setConfirmResign] = useState(false)
  const [unlockedNow, setUnlockedNow] = useState<AiLevelId | null>(null)
  const [animation, setAnimation] = useState<MoveAnimation | null>(null)
  const [demo, setDemo] = useState<string | null>(null)

  // ------------------------------------------------------------ restore prefs
  useEffect(() => {
    const s = loadSettings()
    setSettings(s)
    const p = readJson<Progress>('shogi.ai.progress')
    const beaten = Array.isArray(p?.beaten) ? p.beaten.filter((id) => AI_LEVELS.some((l) => l.id === id)) : []
    const counted = Array.isArray(p?.counted) ? p.counted.filter((id) => typeof id === 'string') : []
    const loaded = { beaten, wins: typeof p?.wins === 'number' ? p.wins : 0, counted }
    progressRef.current = loaded
    setProgress(loaded)
    gameId.current = readJson<string>('shogi.ai.gameId') ?? startGameId()
    setLevel(resolvePlayableLevel(readJson('shogi.ai.level'), new Set(beaten)))
  }, [])

  /** A new game (new 新規対局, or branching from a shared kifu) gets a new id. */
  function startGameId(): string {
    gameId.current = newGameId()
    writeJson('shogi.ai.gameId', gameId.current)
    return gameId.current
  }

  const flash = useCallback((text: string, tone: Flash['tone']) => {
    setNotice({ text, tone, id: ++flashSeq })
  }, [])

  // Open a shared kifu once the saved game has been restored (so it wins).
  const [sharedHandled, setSharedHandled] = useState<string | null>(null)
  useEffect(() => {
    if (!restored || !shared || sharedHandled === shared.k) return
    setSharedHandled(shared.k)
    const kifu = decodeKifuParam(shared.k)
    if (!kifu) {
      clearShareParams()
      flash('棋譜を読み取れませんでした。リンクが途中で切れていないか確かめてください', 'warn')
      return
    }
    let opened: GameView
    try {
      opened = openRecord({ initialSfen: kifu.initialSfen, moves: kifu.usiMoves }, shared.m ?? undefined)
    } catch {
      opened = openRecord({ initialSfen: null, moves: [] })
    }
    // openRecord stops at the first illegal move: a shortened kifu is a broken link.
    if (opened.record.moves.length !== kifu.usiMoves.length) {
      clearShareParams()
      flash('棋譜の途中に読めない手がありました。リンクが壊れている可能性があります', 'warn')
      return
    }
    update(() => opened)
    setReview({ plies: opened.record.moves.length })
    setSelection(null)
    setDialog(null)
    setKifuOpen(true)
  }, [restored, shared, sharedHandled, update, flash])

  function leaveReview() {
    clearShareParams()
    setReview(null)
    reload()
    setKifuOpen(false)
  }

  const humanSide = settings.aiPlayerSide
  const aiSide = getOpponent(humanSide)
  const state = currentState(view)
  const outcome = visibleOutcome(view)
  // A shared kifu is shown from 先手's side unless the player flips it.
  const flipped = settings.flipped !== (!review && humanSide === 'gote')

  // ------------------------------------------------------------ AI
  const ai = useAiOpponent({
    enabled: restored && !review,
    view,
    level,
    aiSide,
    callbacks: {
      onMove: (move, key) => commitMove(move, 'ai', key),
      onResign: (key) => endIfCurrent(key, aiSide),
      onWin: (key) => endIfCurrent(key, humanSide),
      onError: () => flash('AIが応答しませんでした。「新規対局」でやり直してください', 'warn'),
    },
  })

  // In a shared kifu either side may move: the first move starts a game from there.
  const interactive = restored && !outcome && !ai.thinking && (review !== null || state.currentPlayer === humanSide)

  // ------------------------------------------------------------ first-move demo
  const demoEligible =
    interactive &&
    !review &&
    view.record.moves.length === 0 &&
    humanSide === 'sente' &&
    !settings.flipped &&
    (readJson<number>('shogi.demo') ?? 0) < DEMO_MAX_SHOWS

  function showDemo(text: string, delay: number) {
    if (!demoEligible || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    window.setTimeout(() => {
      if (document.visibilityState !== 'visible' || !boardMostlyVisible()) return
      writeJson('shogi.demo', (readJson<number>('shogi.demo') ?? 0) + 1)
      setDemo(text)
    }, delay)
  }

  // At the start of a game: demonstrate once the player has not touched anything
  // (sooner right after 「新規対局」, when they are clearly about to play).
  const [startedByButton, setStartedByButton] = useState(false)
  useEffect(() => {
    if (!demoEligible) return
    let cancelled = false
    const timer = window.setTimeout(
      () => {
        if (!cancelled) showDemo('駒をタップして動かせます', 0)
      },
      startedByButton ? DEMO_NEW_GAME_MS : DEMO_IDLE_MS,
    )
    const cancel = () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    window.addEventListener('pointerdown', cancel, { capture: true, once: true })
    window.addEventListener('keydown', cancel, { capture: true, once: true })
    return () => {
      cancel()
      window.removeEventListener('pointerdown', cancel, { capture: true })
      window.removeEventListener('keydown', cancel, { capture: true })
    }
  }, [demoEligible, startedByButton])

  // A running demo ends on its own, or at the next tap / key press.
  useEffect(() => {
    if (!demo) return
    const stop = () => setDemo(null)
    const timer = window.setTimeout(stop, DEMO_SHOW_MS)
    window.addEventListener('pointerdown', stop, { capture: true })
    window.addEventListener('keydown', stop, { capture: true })
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointerdown', stop, { capture: true })
      window.removeEventListener('keydown', stop, { capture: true })
    }
  }, [demo])

  // ------------------------------------------------------------ helpers

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), CHECK_MS)
    return () => clearTimeout(t)
  }, [notice])

  useEffect(() => {
    if (!hint) return
    const t = setTimeout(() => setHint(null), HINT_MS)
    return () => clearTimeout(t)
  }, [hint])

  useEffect(() => {
    if (!resetUndo) return
    const t = setTimeout(() => setResetUndo(null), RESET_UNDO_MS)
    return () => clearTimeout(t)
  }, [resetUndo])

  useEffect(() => {
    if (!checkLineVisible) return
    const t = setTimeout(() => setCheckLineVisible(false), CHECK_MS)
    return () => clearTimeout(t)
  }, [checkLineVisible])

  function refuse(refusal: Refusal, moving: Parameters<typeof refusalText>[2], at: Square | null) {
    if (at) setShake({ square: at, id: ++flashSeq })
    if (!settings.moveHints) return
    const text = refusalText(refusal, state.board, moving)
    if (text) setHint({ text, cells: refusal.cells, id: ++flashSeq })
  }

  /** Records wins and unlocks once, when a move or resignation ends the game. */
  function finish(next: GameView, me: Player = humanSide) {
    const result = visibleOutcome(next)
    if (!result) return
    setSelection(null)
    setPromotion(null)
    const current = progressRef.current
    if (result.winner === me && !current.counted.includes(gameId.current)) {
      const unlock = levelUnlockedByBeating(level)
      const already = current.beaten.includes(level)
      const updated: Progress = {
        beaten: already ? current.beaten : [...current.beaten, level],
        wins: current.wins + 1,
        counted: [...current.counted, gameId.current].slice(-COUNTED_KEEP),
      }
      progressRef.current = updated
      setProgress(updated)
      writeJson('shogi.ai.progress', updated)
      setUnlockedNow(unlock && !already ? unlock.id : null)
    } else {
      setUnlockedNow(null)
    }
    setDialog('result')
  }

  /** Resignation by the AI (or its entering-king win) — only for the game it was asked about. */
  function endIfCurrent(key: string, loser: Player) {
    let applied = false
    const next = update((v) => {
      if (positionKey(v) !== key || v.outcome) return v
      applied = true
      return resign(v, loser)
    })
    if (applied) finish(next)
  }

  /** `key`: for AI answers, the position the AI was asked about (stale answers are dropped). */
  function commitMove(move: Move, by: 'human' | 'ai', key?: string) {
    if (key !== undefined && key !== positionKey(view)) return
    // Leaving a shared kifu, the player takes the side that makes this move.
    const me = review && by === 'human' ? state.currentPlayer : humanSide
    if (review && by === 'human') {
      if (me !== humanSide) changeSettings({ ...settings, aiPlayerSide: me })
      startGameId()
      setReview(null)
      clearShareParams()
      flash(`${view.cursor}手目から対局を始めました（あなた：${me === 'sente' ? '先手' : '後手'}）`, 'info')
    }
    let next: GameView
    let applied = false
    try {
      next = update((v) => {
        // Re-check against the latest view: `view` above can be a render old.
        if (key !== undefined && (positionKey(v) !== key || v.outcome)) return v
        applied = true
        return play(v, move)
      })
    } catch {
      return // illegal (should not happen: moves are validated before)
    }
    if (!applied) return
    setSelection(null)
    setPromotion(null)
    setHint(null)
    if (by === 'human') {
      setResetUndo(null)
      setDemo(null)
      // Someone who has made a move no longer needs the demo.
      if ((readJson<number>('shogi.demo') ?? 0) < DEMO_MAX_SHOWS) writeJson('shogi.demo', DEMO_MAX_SHOWS)
    }
    const from = move.type === 'move' ? { x: move.fromX, y: move.fromY } : null
    setAnimation({ from, to: { x: move.toX, y: move.toY }, id: ++flashSeq })
    if (settings.sound) playMoveSound()
    if (settings.haptics && by === 'ai') vibrate()
    const after = currentState(next)
    if (after.isCheck && !visibleOutcome(next)) {
      flash(after.currentPlayer === me ? '王手されています' : '王手！', after.currentPlayer === me ? 'warn' : 'attack')
      setCheckLineVisible(true)
    }
    finish(next, me)
  }

  // ------------------------------------------------------------ input
  function trySelectBoard(square: Square): boolean {
    const piece = state.board[square.y][square.x]
    if (!piece || piece.owner !== state.currentPlayer) return false
    if (legalTargets(state, square).length === 0) {
      refuse(explainNoMoves(state, square), piece.type, square)
      setSelection(null)
      return true
    }
    setSelection({ kind: 'board', square })
    setHint(null)
    return true
  }

  function selectHand(type: BasePieceType) {
    if (!interactive) return
    if (selection?.kind === 'hand' && selection.type === type) {
      setSelection(null)
      return
    }
    if (legalDrops(state, type).length === 0) {
      refuse(explainNoDrops(state), type, null)
      return
    }
    setSelection({ kind: 'hand', type })
    setHint(null)
  }

  function moveTo(source: Selection, target: Square) {
    if (source.kind === 'hand') {
      if (legalDrops(state, source.type).some((s) => s.x === target.x && s.y === target.y)) {
        commitMove({ type: 'drop', pieceType: source.type, toX: target.x, toY: target.y }, 'human')
      } else {
        refuse(explainRejectedDrop(state, source.type, target), source.type, target)
        setSelection(null)
      }
      return
    }
    const from = source.square
    const piece = state.board[from.y][from.x]!
    if (!legalTargets(state, from).some((s) => s.x === target.x && s.y === target.y)) {
      refuse(explainRejectedMove(state, from, target), piece.type, target)
      setSelection(null)
      return
    }
    const base = { type: 'move' as const, fromX: from.x, fromY: from.y, toX: target.x, toY: target.y }
    if (mustPromote(piece, target.y)) commitMove({ ...base, promote: true }, 'human')
    else if (canPromote(piece, from.y, target.y)) setPromotion({ from, to: target })
    else commitMove({ ...base, promote: false }, 'human')
  }

  function onSquare(square: Square) {
    unlockAudio()
    if (promotion) return
    if (!interactive) {
      if (restored && !outcome && !atEnd(view) && state.currentPlayer !== humanSide) {
        flash('相手の手番の局面です。＜ ＞ で自分の手番まで動かすと指せます', 'info')
      }
      return
    }
    if (selection) {
      const same = selection.kind === 'board' && selection.square.x === square.x && selection.square.y === square.y
      if (same) {
        setSelection(null)
        return
      }
      const piece = state.board[square.y][square.x]
      // Tapping another own piece switches the selection instead of refusing.
      if (piece && piece.owner === state.currentPlayer && trySelectBoard(square)) return
      moveTo(selection, square)
      return
    }
    if (!trySelectBoard(square)) showDemo('光っている駒をタップして動かせます', DEMO_DEAD_TAP_MS)
  }

  const drag = usePieceDrag<Selection>({
    onStart: (source) => {
      if (!interactive) return false
      if (source.kind === 'board') return trySelectBoard(source.square) && legalTargets(state, source.square).length > 0
      if (legalDrops(state, source.type).length === 0) return false
      setSelection(source)
      return true
    },
    onDrop: (source, target) => {
      if (!target) {
        setSelection(null)
        return
      }
      if (source.kind === 'board' && source.square.x === target.x && source.square.y === target.y) return
      // The source comes from the drag itself: `selection` may not be committed yet.
      moveTo(source, target)
    },
    onCancel: () => setSelection(null),
  })

  // ------------------------------------------------------------ game control
  function newGame(options: { level?: AiLevelId; side?: Player } = {}) {
    const hasProgress = view.record.moves.length >= RESET_UNDO_MIN_PLIES && !view.outcome
    if (hasProgress) setResetUndo({ view, level, side: humanSide, gameId: gameId.current })
    if (options.level) {
      setLevel(options.level)
      writeJson('shogi.ai.level', options.level)
    }
    if (options.side && options.side !== humanSide) {
      changeSettings({ ...settings, aiPlayerSide: options.side })
    }
    ai.cancel()
    update(() => openRecord(EMPTY_RECORD))
    setStartedByButton(true)
    startGameId()
    ai.newGame()
    setSelection(null)
    setPromotion(null)
    setHint(null)
    setDialog(null)
    setKifuOpen(false)
    setConfirmResign(false)
  }

  function undoReset() {
    if (!resetUndo) return
    ai.cancel()
    update(() => resetUndo.view)
    gameId.current = resetUndo.gameId
    writeJson('shogi.ai.gameId', resetUndo.gameId)
    setLevel(resetUndo.level)
    writeJson('shogi.ai.level', resetUndo.level)
    if (resetUndo.side !== humanSide) changeSettings({ ...settings, aiPlayerSide: resetUndo.side })
    setResetUndo(null)
  }

  function changeSettings(next: ShogiSettings) {
    setSettings(next)
    saveSettings(next)
  }

  function closeSettings() {
    setDialog(null)
    if (pendingSide && pendingSide !== humanSide) newGame({ side: pendingSide })
    setPendingSide(null)
  }

  function goTo(cursor: number) {
    ai.cancel()
    setSelection(null)
    setPromotion(null)
    setHint(null)
    update((v) => seek(v, cursor))
    if (dialog === 'result') setDialog(null)
  }

  const goToRef = useRef((_delta: number) => {})
  goToRef.current = (delta) => goTo(view.cursor + delta)
  // ← → step through the game, unless the focus is on the board (arrows move
  // between squares there), in a dialog, or in a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.altKey || e.ctrlKey || e.metaKey) return
      const target = e.target as HTMLElement | null
      if (target?.closest('.board-grid, dialog, input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
      goToRef.current(e.key === 'ArrowLeft' ? -1 : 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ------------------------------------------------------------ derived view data
  const movable = useMemo(() => (interactive && !selection ? movablePieces(state) : []), [interactive, selection, state])
  const targets = useMemo(() => {
    if (!selection || !interactive) return []
    return selection.kind === 'board' ? legalTargets(state, selection.square) : legalDrops(state, selection.type)
  }, [selection, interactive, state])

  const lastMove = useMemo(() => {
    const usi = view.cursor > 0 ? view.record.moves[view.cursor - 1] : null
    const move = usi ? parseUsiMove(usi) : null
    return move ? { x: move.toX, y: move.toY } : null
  }, [view])

  const check = useMemo(() => {
    if (!state.isCheck) return { cells: [] as Square[], line: null as { from: Square; to: Square } | null }
    const king = findKing(state.currentPlayer, state.board)
    const attackers = checkingPieces(state.currentPlayer, state.board)
    const far = king ? attackers.find((a) => Math.max(Math.abs(a.x - king.x), Math.abs(a.y - king.y)) >= 2) : undefined
    return {
      cells: settings.moveHints ? [...attackers, ...(king ? [king] : [])] : [],
      line: settings.moveHints && king && far ? { from: far, to: king } : null,
    }
  }, [state, settings.moveHints])

  const promotionPiece = promotion ? state.board[promotion.from.y][promotion.from.x] : null
  const promotionAt = promotion
    ? flipped
      ? { row: 8 - promotion.to.y, col: 8 - promotion.to.x }
      : { row: promotion.to.y, col: promotion.to.x }
    : null
  const selectedHand = selection?.kind === 'hand' ? selection.type : null

  const topSide = flipped ? 'sente' : 'gote'
  const bottomSide = getOpponent(topSide)
  const sideLabel = (side: Player) => (review ? (side === 'sente' ? '先手' : '後手') : side === humanSide ? 'あなた' : 'AI')
  const levelInfo = getAiLevel(level)

  return (
    <div className="game" onPointerDown={unlockAudio}>
      <div className="game-toolbar">
        <button type="button" className="level-button" onClick={() => setDialog('level')} aria-haspopup="dialog">
          <span className="level-caption">強さ</span>
          <span className="level-value">{levelInfo.label}</span>
        </button>
        <div className="toolbar-actions">
          <button
            type="button"
            className="icon-button"
            aria-label="盤面を反転"
            aria-pressed={settings.flipped}
            onClick={() => changeSettings({ ...settings, flipped: !settings.flipped })}
          >
            ⇅
          </button>
          <button type="button" className="icon-button" aria-label="設定" aria-haspopup="dialog" onClick={() => setDialog('settings')}>
            ⚙
          </button>
        </div>
      </div>

      {review && (
        <div className="review-banner" role="status">
          <div>
            <strong>共有された棋譜（{review.plies}手）</strong>
            <span>駒を動かすと、{view.cursor}手目の局面から続きをAIと指せます</span>
          </div>
          <button type="button" className="chip" onClick={leaveReview}>
            自分の対局に戻る
          </button>
        </div>
      )}

      <div className="board-area">
        <Hand
          owner={topSide}
          label={sideLabel(topSide)}
          pieces={state.capturedPieces[topSide]}
          active={state.currentPlayer === topSide}
          selected={topSide === humanSide ? selectedHand : null}
          droppable={interactive && topSide === humanSide}
          pieceStyle={settings.pieceStyle}
          onSelect={selectHand}
          onPiecePointerDown={(type, e) => drag.arm({ kind: 'hand', type }, e)}
        />
        <div className="board-stage">
          <Board
            board={state.board}
            flipped={flipped}
            pieceStyle={settings.pieceStyle}
            selected={selection?.kind === 'board' ? selection.square : null}
            targets={targets}
            movable={movable}
            lastMove={lastMove}
            checkCells={check.cells}
            checkLine={checkLineVisible || dialog === 'result' ? check.line : null}
            hintCells={hint?.cells ?? []}
            shake={shake}
            animation={animation}
            interactive={interactive}
            overlay={
              demo && !promotion ? (
                <FirstMoveDemo text={demo} />
              ) : (
              promotion && promotionPiece && promotionAt && (
              <PromoteSheet
                type={promotionPiece.type}
                at={promotionAt}
                pieceStyle={settings.pieceStyle}
                onChoose={(promote) =>
                  commitMove(
                    { type: 'move', fromX: promotion.from.x, fromY: promotion.from.y, toX: promotion.to.x, toY: promotion.to.y, promote },
                    'human',
                  )
                }
                onCancel={() => {
                  setPromotion(null)
                  setSelection(null)
                }}
              />
            ))
            }
            onSquare={onSquare}
            onPiecePointerDown={(square, e) => drag.arm({ kind: 'board', square }, e)}
          />
          {ai.thinking && (
            <div className={`thinking ${flipped ? 'thinking-bottom' : ''}`} role="status">
              <span className="thinking-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              考え中
            </div>
          )}
          {hint && (
            <div
              className="move-hint"
              style={{ top: `calc(16px + ${hintRow(hint.cells, flipped)} * var(--cell))` }}
              role="status"
              aria-live="polite"
              key={hint.id}
            >
              {hint.text}
            </div>
          )}
        </div>
        <Hand
          owner={bottomSide}
          label={sideLabel(bottomSide)}
          pieces={state.capturedPieces[bottomSide]}
          active={state.currentPlayer === bottomSide}
          selected={bottomSide === humanSide ? selectedHand : null}
          droppable={interactive && bottomSide === humanSide}
          pieceStyle={settings.pieceStyle}
          onSelect={selectHand}
          onPiecePointerDown={(type, e) => drag.arm({ kind: 'hand', type }, e)}
        />
      </div>

      <KifuBar
        view={view}
        open={kifuOpen}
        onToggle={() => setKifuOpen((o) => !o)}
        onJump={goTo}
        turnLabel={outcome ? '対局終了' : `手番：${sideLabel(state.currentPlayer)}`}
      />

      <div className="controls">
        <button type="button" className="btn btn-step" aria-label="一手戻る" disabled={view.cursor === 0} onClick={() => goTo(view.cursor - 1)}>
          ＜
        </button>
        <button
          type="button"
          className="btn btn-step"
          aria-label="一手進む"
          disabled={view.cursor === view.record.moves.length}
          onClick={() => goTo(view.cursor + 1)}
        >
          ＞
        </button>
        <button type="button" className="btn btn-primary" onClick={() => newGame()}>
          新規対局
        </button>
        {!view.outcome && view.record.moves.length > 0 && (
          <button
            type="button"
            className={`btn btn-quiet ${confirmResign ? 'btn-danger' : ''}`}
            onClick={() => {
              if (!confirmResign) {
                setConfirmResign(true)
                setTimeout(() => setConfirmResign(false), 3000)
                return
              }
              setConfirmResign(false)
              ai.cancel()
              finish(update((v) => resign(seek(v, v.record.moves.length), humanSide)))
            }}
          >
            {confirmResign ? '本当に投了する' : '投了'}
          </button>
        )}
      </div>

      {notice && (
        <div className={`notice notice-${notice.tone}`} role="status" key={notice.id}>
          {notice.text}
        </div>
      )}

      {resetUndo && (
        <div className="undo-toast" role="status">
          <span>対局をリセットしました</span>
          <button type="button" className="undo-action" onClick={undoReset}>
            元に戻す
          </button>
          <button type="button" className="icon-button" aria-label="閉じる" onClick={() => setResetUndo(null)}>
            ✕
          </button>
        </div>
      )}

      {drag.ghost && <DragGhost source={drag.ghost.source} x={drag.ghost.x} y={drag.ghost.y} board={state.board} owner={humanSide} style={settings.pieceStyle} flipped={flipped} />}

      <ResultDialog
        open={dialog === 'result' && !!outcome}
        outcome={outcome}
        humanSide={humanSide}
        levelLabel={levelInfo.label}
        wins={progress.wins}
        unlocked={unlockedNow ? getAiLevel(unlockedNow).label : null}
        view={view}
        flipped={flipped}
        pieceStyle={settings.pieceStyle}
        onClose={() => {
          setDialog(null)
          setKifuOpen(true)
        }}
        onNext={() => newGame(unlockedNow ? { level: unlockedNow } : {})}
      />
      <SettingsDialog
        open={dialog === 'settings'}
        settings={settings}
        pendingSide={pendingSide}
        movesPlayed={view.outcome ? 0 : view.record.moves.length}
        onChange={changeSettings}
        onSideChange={(side) => setPendingSide(side === humanSide ? null : side)}
        onClose={closeSettings}
        diagnostics={ai.diagnostics}
        view={view}
        level={level}
      />
      <LevelPicker
        open={dialog === 'level'}
        current={level}
        beaten={progress.beaten}
        onPick={(picked) => {
          setDialog(null)
          if (picked === level) return
          if (view.record.moves.length === 0) {
            ai.cancel()
            setLevel(picked)
            writeJson('shogi.ai.level', picked)
            return
          }
          newGame({ level: picked })
        }}
        onClose={() => setDialog(null)}
      />
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

/** The demo only makes sense when most of the board is on screen. */
function boardMostlyVisible(): boolean {
  const rect = document.querySelector('.board-grid')?.getBoundingClientRect()
  if (!rect || rect.height === 0) return false
  const visible = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0)
  return visible / rect.height >= 0.6
}

function DragGhost({
  source,
  x,
  y,
  board,
  owner,
  style,
  flipped,
}: {
  source: Selection
  x: number
  y: number
  board: GameView['states'][number]['board']
  owner: Player
  style: ShogiSettings['pieceStyle']
  flipped: boolean
}) {
  const piece = source.kind === 'board' ? board[source.square.y][source.square.x] : { type: source.type, owner }
  if (!piece) return null
  return (
    <div className="drag-ghost" style={{ left: x, top: y }} aria-hidden="true">
      <Piece type={piece.type} owner={piece.owner} style={style} flipped={flipped} />
    </div>
  )
}
