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
import { getOpponent } from '../core/engine'
import type { Move, Player } from '../core/engine'
import { parseUsiMove } from '../core/kifu/moves'
import { decodeKifuParam } from '../core/kifu/url'
import { atEnd, currentState, openRecord, play, resign, seek, visibleOutcome } from '../core/record'
import type { GameView } from '../core/record'
import { readJson, writeJson } from '../../../site/storage'
import type { MoveAnimation } from './Board'
import { playMoveSound, unlockAudio, vibrate } from './feedback'
import { FirstMoveDemo } from './FirstMoveDemo'
import { GameBoard } from './GameBoard'
import { KifuBar } from './KifuBar'
import { LevelPicker } from './LevelPicker'
import { ResultDialog } from './ResultDialog'
import { SettingsDialog } from './SettingsDialog'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings'
import type { ShogiSettings } from './settings'
import { positionKey, useAiOpponent } from './useAiOpponent'
import { useBoardInput } from './useBoardInput'
import { EMPTY_RECORD, useShogiGame } from './useShogiGame'

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

  const input = useBoardInput({
    state,
    interactive,
    moveHints: settings.moveHints,
    onMove: (move) => commitMove(move, 'human'),
    onBlockedTap: () => {
      if (restored && !outcome && !atEnd(view) && state.currentPlayer !== humanSide) {
        flash('相手の手番の局面です。＜ ＞ で自分の手番まで動かすと指せます', 'info')
      }
    },
    onDeadTap: () => showDemo('光っている駒をタップして動かせます', DEMO_DEAD_TAP_MS),
  })

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
    if (!resetUndo) return
    const t = setTimeout(() => setResetUndo(null), RESET_UNDO_MS)
    return () => clearTimeout(t)
  }, [resetUndo])

  useEffect(() => {
    if (!checkLineVisible) return
    const t = setTimeout(() => setCheckLineVisible(false), CHECK_MS)
    return () => clearTimeout(t)
  }, [checkLineVisible])

  /** Records wins and unlocks once, when a move or resignation ends the game. */
  function finish(next: GameView, me: Player = humanSide) {
    const result = visibleOutcome(next)
    if (!result) return
    input.clear()
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
    input.clear()
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
    input.clear()
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
    input.clear()
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
  const lastMove = useMemo(() => {
    const usi = view.cursor > 0 ? view.record.moves[view.cursor - 1] : null
    const move = usi ? parseUsiMove(usi) : null
    return move ? { x: move.toX, y: move.toY } : null
  }, [view])

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

      <GameBoard
        state={state}
        input={input}
        interactive={interactive}
        flipped={flipped}
        pieceStyle={settings.pieceStyle}
        moveHints={settings.moveHints}
        label={sideLabel}
        lastMove={lastMove}
        animation={animation}
        showCheckLine={checkLineVisible || dialog === 'result'}
        overlay={demo ? <FirstMoveDemo text={demo} /> : null}
      >
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
      </GameBoard>

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

/** The demo only makes sense when most of the board is on screen. */
function boardMostlyVisible(): boolean {
  const rect = document.querySelector('.board-grid')?.getBoundingClientRect()
  if (!rect || rect.height === 0) return false
  const visible = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0)
  return visible / rect.height >= 0.6
}
