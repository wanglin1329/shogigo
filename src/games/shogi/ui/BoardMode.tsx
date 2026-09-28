// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useMemo, useRef, useState } from 'react'

import type { Move, Player } from '../core/engine'
import { parseUsiMove } from '../core/kifu/moves'
import { currentState, openRecord, play, resign, seek, visibleOutcome } from '../core/record'
import type { GameRecord, GameView } from '../core/record'
import { gameWaza } from '../core/waza/tracker'
import { IconChevronLeft, IconChevronRight, IconClose, IconFlip } from '../../../site/icons'
import { writeJson } from '../../../site/storage'
import { isWideScreen, useOpenOnWideScreen } from '../../../site/viewport'
import { Modal } from '../../../site/Modal'
import type { MoveAnimation } from './Board'
import { playMoveSound, unlockAudio } from './feedback'
import { GameBoard } from './GameBoard'
import { KifuBar } from './KifuBar'
import { KifuImportDialog } from './KifuImportDialog'
import { RESULT_REASON } from './messages'
import { loadGameMeta, newGameMeta } from './records/gameMeta'
import type { GameMeta } from './records/gameMeta'
import { useRecordSaver } from './records/useRecordSaver'
import { RecordSaveNote, WazaList } from './ResultExtras'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings'
import type { ShogiSettings } from './settings'
import { useBoardInput } from './useBoardInput'
import { EMPTY_RECORD, useShogiGame } from './useShogiGame'
import { WAZA_COPY } from './waza-copy'
import { useWazaDetection, WazaEffect } from './WazaEffect'

const SIDE: Record<Player, string> = { sente: '先手', gote: '後手' }
const RESET_UNDO_MS = 10_000
const NOTICE_MS = 2400
const META_KEY = 'shogi.board.gameMeta'
const BOTH_SIDES: readonly Player[] = ['sente', 'gote']

/**
 * One device, two players (docs/PLAN.md §9 P2): both sides move from the same
 * screen. Same board, kifu, import and autosave as the AI mode, no AI.
 */
export function BoardMode() {
  const { view, restored, update } = useShogiGame('shogi.board.game')
  const [settings, setSettings] = useState<ShogiSettings>(DEFAULT_SETTINGS)
  const [animation, setAnimation] = useState<MoveAnimation | null>(null)
  const [notice, setNotice] = useState<{ text: string; id: number } | null>(null)
  const [checkLine, setCheckLine] = useState(false)
  const [kifuOpen, setKifuOpen] = useState(false)
  useOpenOnWideScreen(setKifuOpen)
  const [dialog, setDialog] = useState<'result' | 'import' | null>(null)
  const [resetUndo, setResetUndo] = useState<{ view: GameView; meta: GameMeta } | null>(null)
  const [confirmResign, setConfirmResign] = useState(false)
  const seq = useRef(0)
  const game = useRef<GameMeta>({ id: '', startedAt: 0 })
  const [imported, setImported] = useState(false)
  const records = useRecordSaver()

  useEffect(() => {
    setSettings(loadSettings())
    game.current = loadGameMeta(META_KEY)
    setImported(game.current.imported === true)
  }, [])

  function setGame(meta: GameMeta) {
    game.current = meta
    writeJson(META_KEY, meta)
    setImported(meta.imported === true)
  }

  const state = currentState(view)
  const outcome = visibleOutcome(view)
  // Resigning ends the game at the end of the record, even while an earlier move is shown.
  const resigner = currentState(seek(view, view.record.moves.length)).currentPlayer
  const flipped = settings.flipped !== (settings.boardAutoFlip && state.currentPlayer === 'gote')
  const waza = useWazaDetection({
    initialSfen: view.record.initialSfen,
    moves: view.record.moves,
    cursor: view.cursor,
    owners: BOTH_SIDES,
  })
  const kept = waza.keptAt(view.cursor)

  const input = useBoardInput({
    state,
    interactive: restored && !outcome,
    moveHints: settings.moveHints,
    onMove: commit,
  })

  function commit(move: Move) {
    let next: GameView
    try {
      next = update((v) => play(v, move))
    } catch {
      return
    }
    setResetUndo(null)
    // The first move in an imported kifu is where the game starts.
    if (game.current.imported) setGame({ id: game.current.id, startedAt: Date.now() })
    setAnimation({ from: move.type === 'move' ? { x: move.fromX, y: move.fromY } : null, to: { x: move.toX, y: move.toY }, id: ++seq.current })
    if (settings.sound) playMoveSound()
    const after = currentState(next)
    if (after.isCheck && !visibleOutcome(next)) {
      setNotice({ text: `${SIDE[after.currentPlayer]}に王手`, id: ++seq.current })
      setCheckLine(true)
    }
    finish(next)
  }

  /** A move or a resignation ended the game: show the result and keep it in 対局記録. */
  function finish(next: GameView) {
    const result = visibleOutcome(next)
    if (!result) return
    setDialog('result')
    records.save({
      id: game.current.id,
      startedAt: game.current.startedAt,
      endedAt: Date.now(),
      mode: 'board',
      player: null,
      winner: result.winner === 'draw' ? null : result.winner,
      reason: result.reason,
      initialSfen: next.record.initialSfen,
      moves: next.record.moves.slice(0, result.plies),
      opponentName: '',
      wazaIds: gameWaza(next.record.initialSfen, next.record.moves, BOTH_SIDES).map((e) => e.id),
    })
  }

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), NOTICE_MS)
    return () => clearTimeout(t)
  }, [notice])
  useEffect(() => {
    if (!checkLine) return
    const t = setTimeout(() => setCheckLine(false), NOTICE_MS)
    return () => clearTimeout(t)
  }, [checkLine])
  useEffect(() => {
    if (!resetUndo) return
    const t = setTimeout(() => setResetUndo(null), RESET_UNDO_MS)
    return () => clearTimeout(t)
  }, [resetUndo])
  useEffect(() => {
    if (!confirmResign) return
    const t = setTimeout(() => setConfirmResign(false), 3000)
    return () => clearTimeout(t)
  }, [confirmResign])

  function changeSettings(next: ShogiSettings) {
    setSettings(next)
    saveSettings(next)
  }

  function goTo(cursor: number) {
    input.clear()
    update((v) => seek(v, cursor))
  }

  function newGame(record: GameRecord = EMPTY_RECORD, cursor?: number) {
    if (view.record.moves.length >= 3 && !view.outcome) setResetUndo({ view, meta: game.current })
    setGame(record === EMPTY_RECORD ? newGameMeta() : { ...newGameMeta(), imported: true })
    records.reset()
    input.clear()
    update(() => openRecord(record, cursor))
    setDialog(null)
    setKifuOpen(record !== EMPTY_RECORD || isWideScreen())
  }

  // ← → step through the game unless the focus is on the board or in a dialog.
  const goToRef = useRef((_delta: number) => {})
  goToRef.current = (delta) => goTo(view.cursor + delta)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.altKey || e.ctrlKey || e.metaKey) return
      if ((e.target as HTMLElement | null)?.closest('.board-grid, dialog, input, textarea, select')) return
      e.preventDefault()
      goToRef.current(e.key === 'ArrowLeft' ? -1 : 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const lastMove = useMemo(() => {
    const usi = view.cursor > 0 ? view.record.moves[view.cursor - 1] : null
    const move = usi ? parseUsiMove(usi) : null
    return move ? { x: move.toX, y: move.toY } : null
  }, [view])

  return (
    <div className="game" onPointerDown={unlockAudio}>
      <div className="game-top">
        <div className="game-toolbar">
          <label className="setting-toggle board-autoflip">
            <input
              type="checkbox"
              checked={settings.boardAutoFlip}
              onChange={(e) => changeSettings({ ...settings, boardAutoFlip: e.target.checked })}
            />
            <span>毎手、手番の側から見る</span>
          </label>
          <button
            type="button"
            className="icon-button"
            aria-label="盤面を反転"
            aria-pressed={settings.flipped}
            onClick={() => changeSettings({ ...settings, flipped: !settings.flipped })}
          >
            <IconFlip />
          </button>
        </div>
      </div>

      <div className="game-main">
        <GameBoard
          state={state}
          input={input}
          interactive={restored && !outcome}
          flipped={flipped}
          pieceStyle={settings.pieceStyle}
          moveHints={settings.moveHints}
          label={(side) => SIDE[side]}
          lastMove={lastMove}
          animation={animation}
          showCheckLine={checkLine}
          overlay={<WazaEffect waza={waza} trigger={animation?.id ?? null} ended={!!outcome} flipped={flipped} level={settings.wazaFx} />}
        />
      </div>

      <div className="game-bottom">
        <KifuBar
          view={view}
          open={kifuOpen}
          onToggle={() => setKifuOpen((o) => !o)}
          onJump={goTo}
          onImport={() => setDialog('import')}
          keptName={kept ? WAZA_COPY[kept.id].name : null}
          turnLabel={outcome ? '対局終了' : `手番：${SIDE[state.currentPlayer]}`}
        />

        <div className="controls">
          <button type="button" className="btn btn-step" aria-label="一手戻る" disabled={view.cursor === 0} onClick={() => goTo(view.cursor - 1)}>
            <IconChevronLeft />
          </button>
          <button
            type="button"
            className="btn btn-step"
            aria-label="一手進む"
            disabled={view.cursor === view.record.moves.length}
            onClick={() => goTo(view.cursor + 1)}
          >
            <IconChevronRight />
          </button>
          <button type="button" className="btn btn-primary" onClick={() => newGame()}>
            新規対局
          </button>
          {!view.outcome && view.record.moves.length > 0 && !imported && (
            <button
              type="button"
              className={`btn btn-quiet ${confirmResign ? 'btn-danger' : ''}`}
              onClick={() => {
                if (!confirmResign) return setConfirmResign(true)
                setConfirmResign(false)
                finish(update((v) => resign(seek(v, v.record.moves.length), resigner)))
              }}
            >
              {confirmResign ? `${SIDE[resigner]}が投了する` : `${SIDE[resigner]}の投了`}
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className="notice notice-warn" role="status" key={notice.id}>
          {notice.text}
        </div>
      )}
      {resetUndo && (
        <div className="undo-toast" role="status">
          <span>対局をリセットしました</span>
          <button
            type="button"
            className="undo-action"
            onClick={() => {
              update(() => resetUndo.view)
              setGame(resetUndo.meta)
              setResetUndo(null)
            }}
          >
            元に戻す
          </button>
          <button type="button" className="icon-button" aria-label="閉じる" onClick={() => setResetUndo(null)}>
            <IconClose />
          </button>
        </div>
      )}

      <Modal
        open={dialog === 'result' && !!outcome}
        title={outcome ? (outcome.winner === 'draw' ? '引き分け' : `${SIDE[outcome.winner]}の勝ち`) : ''}
        onClose={() => {
          setDialog(null)
          setKifuOpen(true)
        }}
        className="modal-result"
      >
        {outcome && (
          <p className="result-sub">
            {outcome.plies}手・{RESULT_REASON[outcome.reason] ?? '終局'}
          </p>
        )}
        {dialog === 'result' && <WazaList entries={waza.summary()} />}
        <RecordSaveNote status={records.status} onRetry={records.retry} />
        <button type="button" className="btn btn-primary result-next" onClick={() => newGame()}>
          新しい対局
        </button>
      </Modal>
      <KifuImportDialog open={dialog === 'import'} onClose={() => setDialog(null)} onOpen={(record) => newGame(record, 0)} />
    </div>
  )
}
