// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useMemo, useRef, useState } from 'react'
import { useBlocker } from '@tanstack/react-router'

import type { GameState, Move, Player } from '../../core/engine'
import { parseUsiMove } from '../../core/kifu/moves'
import { openRecord } from '../../core/record'
import type { GameView } from '../../core/record'
import { gameWaza } from '../../core/waza/tracker'
import type { BotReport } from '../../online/botGame'
import { formatClock, isTimed, useClock } from '../../online/clock'
import type { SideClock } from '../../online/clock'
import { ANONYMOUS, COM_NAME, shownName } from '../../online/identity'
import type { ConnectionStatus } from '../../online/room'
import type { DisconnectInfo, MatchPayload } from '../../server/protocol'
import { Modal } from '../../../../site/Modal'
import type { MoveAnimation } from '../Board'
import { announce } from '../byoyomi'
import { playMoveSound, vibrate } from '../feedback'
import { GameBoard } from '../GameBoard'
import { KifuBar } from '../KifuBar'
import { RESULT_REASON } from '../messages'
import { useRecordSaver } from '../records/useRecordSaver'
import { RecordSaveNote, WazaList } from '../ResultExtras'
import type { ShogiSettings } from '../settings'
import { useBoardInput } from '../useBoardInput'
import { WAZA_COPY } from '../waza-copy'
import { useWazaDetection, WazaEffect } from '../WazaEffect'
import { RankBadge, rankLabel } from './RankBadge'

/** What an online game looks like to the view: a real room or a local COM game. */
export interface OnlineGameModel {
  kind: 'room' | 'bot'
  match: MatchPayload
  yourSide: Player
  position: GameState
  skewMs: number
  disconnect: DisconnectInfo
  connection: ConnectionStatus | null
  /** A sent move is still unconfirmed after a second. */
  sending: boolean
  /** COM is thinking (bot games). */
  thinking: boolean
  error: string | null
  report: BotReport | null
  playMove: (move: Move) => void
  /** Resolves once the resignation reached the server (rooms) or at once (COM). */
  resign: () => Promise<unknown> | void
}

const REASON: Record<string, string> = {
  ...RESULT_REASON,
  timeout: '時間切れ',
  disconnect: '接続切れ',
}

const START_OVERLAY_MS = 2600
const other = (side: Player): Player => (side === 'sente' ? 'gote' : 'sente')

function Clock({ clock }: { clock: SideClock | undefined }) {
  if (!clock) return null
  return (
    <span className={`clock clock-${clock.level} ${clock.running ? 'clock-running' : ''}`} aria-label={`残り${Math.ceil(clock.ms / 1000)}秒`}>
      {formatClock(clock.ms)}
    </span>
  )
}

/** Keep the screen on while a timed game is running (phones sleep in 30 s). */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let released = false
    const acquire = () => {
      if (document.visibilityState !== 'visible') return
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (released) void l.release()
          else lock = l
        })
        .catch(() => {})
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      released = true
      document.removeEventListener('visibilitychange', acquire)
      void lock?.release()
    }
  }, [active])
}

export function OnlineGame({
  model,
  settings,
  hideRank,
  onLobby,
  onAgain,
  againLabel,
}: {
  model: OnlineGameModel
  settings: ShogiSettings
  hideRank: boolean
  onLobby: () => void
  /** 「もう一度」: seek again (random / COM) or a new room with the same settings (friend). */
  onAgain: () => void
  againLabel: string
}) {
  const { match, yourSide: me, position } = model
  const opp = other(me)
  const flipped = me === 'gote'
  const moves = match.state.usiMoveHistory
  const started = match.sente_joined && match.gote_joined
  const over = match.game_over
  const myTurn = started && !over && position.currentPlayer === me

  // ------------------------------------------------------------ board input
  const input = useBoardInput({
    state: position,
    interactive: myTurn && !model.sending,
    moveHints: settings.moveHints,
    onMove: (move) => {
      if (settings.sound) playMoveSound()
      model.playMove(move)
    },
  })

  // ------------------------------------------------------------ moves arriving (animation, sound, check line)
  const [animation, setAnimation] = useState<MoveAnimation | null>(null)
  const [checkLine, setCheckLine] = useState(false)
  const seen = useRef(moves.length)
  useEffect(() => {
    if (moves.length <= seen.current) {
      seen.current = moves.length
      return
    }
    seen.current = moves.length
    const last = parseUsiMove(moves[moves.length - 1])
    if (last) setAnimation({ from: last.type === 'move' ? { x: last.fromX, y: last.fromY } : null, to: { x: last.toX, y: last.toY }, id: moves.length })
    // The mover is whoever is not to move now. My own moves already sounded
    // when played; the opponent's sound (and buzz) on arrival.
    if (position.currentPlayer === me) {
      if (settings.sound) playMoveSound()
      if (settings.haptics) vibrate()
    }
    if (position.isCheck) setCheckLine(true)
  }, [moves, position, me, settings.sound, settings.haptics])
  useEffect(() => {
    if (!checkLine) return
    const t = setTimeout(() => setCheckLine(false), 2400)
    return () => clearTimeout(t)
  }, [checkLine])

  // ------------------------------------------------------------ clocks and byoyomi
  const clock = useClock(match, model.skewMs)
  const timed = isTimed(match)
  const lastSpoken = useRef<number>(Infinity)
  const myTurnStartedAt = useRef<string | null>(null)
  useEffect(() => {
    if (!clock || !timed || clock.active !== me || settings.byoyomi === 'off') return
    const seconds = Math.ceil(clock[me].ms / 1000)
    const turnId = `${moves.length}`
    if (myTurnStartedAt.current !== turnId) {
      myTurnStartedAt.current = turnId
      lastSpoken.current = seconds
      return
    }
    lastSpoken.current = announce(seconds, lastSpoken.current, settings.byoyomi, match.tc_type === 'per_move')
  }, [clock, timed, me, moves.length, settings.byoyomi, match.tc_type])

  useWakeLock(started && !over)

  // ------------------------------------------------------------ start overlay
  const [startOverlay, setStartOverlay] = useState(false)
  const announced = useRef(false)
  useEffect(() => {
    if (!started || over || announced.current) return
    announced.current = true
    if (moves.length === 0) setStartOverlay(true) // not when rejoining a game in progress
  }, [started, over, moves.length])
  // Its own effect: tied to the one above, the first move (COM plays 先手 at
  // once) would clear the timer and leave the overlay up for good.
  useEffect(() => {
    if (!startOverlay) return
    const t = setTimeout(() => setStartOverlay(false), START_OVERLAY_MS)
    return () => clearTimeout(t)
  }, [startOverlay])

  // ------------------------------------------------------------ disconnect countdown (1 s tick)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!model.disconnect.deadline || over) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [model.disconnect.deadline, over])
  const disconnectLeft = model.disconnect.deadline
    ? Math.max(0, Math.ceil((Date.parse(model.disconnect.deadline) - (now + model.skewMs)) / 1000))
    : null

  // ------------------------------------------------------------ result
  const [resultOpen, setResultOpen] = useState(false)
  const shownResult = useRef(false)
  useEffect(() => {
    if (over && !shownResult.current) {
      shownResult.current = true
      setResultOpen(true)
    }
  }, [over])

  // ------------------------------------------------------------ resign / leave
  const [confirm, setConfirm] = useState<'resign' | 'leave' | null>(null)
  useEffect(() => {
    if (!confirm) return
    const t = setTimeout(() => setConfirm(null), 3000)
    return () => clearTimeout(t)
  }, [confirm])

  // Leaving through an in-site link mid-game (e.g. the 「AIと対局」 tab) resigns
  // first, after asking. Without this the opponent would wait out the 60 s
  // disconnect grace, and a COM game would never report its result.
  const blocker = useBlocker({ shouldBlockFn: () => started && !over, withResolver: true })
  const [leaving, setLeaving] = useState(false)

  // ------------------------------------------------------------ kifu
  const view: GameView = useMemo(() => openRecord({ initialSfen: null, moves: [...moves] }), [moves])
  const [kifuOpen, setKifuOpen] = useState(false)
  const waza = useWazaDetection({ initialSfen: null, moves: view.record.moves, cursor: view.cursor, owners: [me] })
  const kept = waza.keptAt(view.cursor)

  const nameOf = (side: Player) => {
    if (side === me) return 'あなた'
    const raw = side === 'sente' ? match.sente_name : match.gote_name
    return model.kind === 'bot' ? COM_NAME : shownName(raw) || ANONYMOUS
  }
  const rankOf = (side: Player) => {
    if (hideRank || match.match_type !== 'matchmaking') return null
    const visible = side === 'sente' ? match.sente_rank_visible : match.gote_rank_visible
    return visible ? (side === 'sente' ? match.sente_rank : match.gote_rank) : null
  }

  function playerRow(side: Player) {
    const disconnected = model.disconnect.side === side && disconnectLeft !== null && !over
    return (
      <div className={`player-row ${position.currentPlayer === side && !over ? 'player-turn' : ''}`}>
        <span className="player-name">
          {nameOf(side)}
          <RankBadge rank={rankOf(side)} />
        </span>
        {disconnected && (
          <span className="player-warn" role="status">
            {side === me ? '接続が切れています' : '相手の接続が切れています'}・残り{disconnectLeft}秒
          </span>
        )}
        {side === me && model.sending && <span className="player-note">送信中…</span>}
        {side !== me && model.thinking && <span className="player-note">考え中…</span>}
        {timed && <Clock clock={clock?.[side]} />}
      </div>
    )
  }

  // Rating shown in the result: from the room (human match) or from the COM report.
  const rating = (() => {
    if (model.kind === 'bot') {
      if (model.report?.status !== 'done' || !model.report.outcome.rated) return null
      const o = model.report.outcome
      return { rating: o.rating.rating, delta: o.ratingDelta, promoted: o.promotedTo }
    }
    const r = me === 'sente' ? match.sente_rating : match.gote_rating
    const d = me === 'sente' ? match.sente_rating_delta : match.gote_rating_delta
    const p = me === 'sente' ? match.sente_promoted : match.gote_promoted
    return r === null || d === null ? null : { rating: r, delta: d, promoted: p }
  })()
  // ------------------------------------------------------------ 対局記録
  // Saved when the game ends, and again (same id) once the rating is known:
  // a COM game reports its result after the end.
  const records = useRecordSaver()
  const saveRecord = useRef(() => {})
  saveRecord.current = () => {
    const startedAt = Date.parse(match.started_at ?? match.created_at)
    const endedAt = match.ended_at ? Date.parse(match.ended_at) : Date.now()
    const oppRating = opp === 'sente' ? match.sente_rating : match.gote_rating
    records.save({
      // Room codes are reused once a room has expired: the creation time makes the id unique.
      id: `${model.kind === 'bot' ? 'bot' : match.room_code}:${match.created_at}`,
      startedAt,
      endedAt: Math.max(startedAt, endedAt),
      mode: model.kind === 'bot' ? 'bot' : 'online',
      player: me,
      winner: match.winner === 'draw' ? null : match.winner,
      reason: match.result_reason ?? 'unknown',
      initialSfen: null,
      moves: [...moves],
      opponentName: nameOf(opp),
      opponentRank: rankLabel(rankOf(opp)),
      opponentRating: oppRating,
      wazaIds: gameWaza(null, moves, [me]).map((e) => e.id),
    })
  }
  const ratingKey = rating ? `${rating.rating}` : ''
  useEffect(() => {
    if (over && started) saveRecord.current()
  }, [over, started, ratingKey])

  const tone = match.winner === 'draw' ? 'draw' : match.winner === me ? 'win' : 'lose'
  const title = tone === 'draw' ? '引き分け' : tone === 'win' ? 'あなたの勝ち！' : `${nameOf(opp)}の勝ち`

  return (
    <div className="game online-game">
      {playerRow(opp)}
      <GameBoard
        state={position}
        input={input}
        interactive={myTurn && !model.sending}
        flipped={flipped}
        pieceStyle={settings.pieceStyle}
        moveHints={settings.moveHints}
        label={(side) => (side === me ? 'あなた' : nameOf(side))}
        lastMove={position.lastMove}
        animation={animation}
        showCheckLine={checkLine}
        overlay={
          <>
            {startOverlay && (
              <div className="start-overlay" role="status">
                <strong>対局開始</strong>
                <span>あなたは{me === 'sente' ? '先手（先に指す）' : '後手'}です</span>
              </div>
            )}
            <WazaEffect waza={waza} trigger={animation?.id ?? null} ended={over} flipped={flipped} level={settings.wazaFx} />
          </>
        }
      />
      {playerRow(me)}

      {model.error && (
        <p className="online-error" role="alert">
          {model.error}
        </p>
      )}
      {model.connection && model.connection !== 'open' && !over && (
        <p className="online-connection" role="status">
          {model.connection === 'polling' ? '通信が不安定なため、ゆっくり更新しています…' : '接続中…'}
        </p>
      )}

      <KifuBar
        view={view}
        open={kifuOpen}
        onToggle={() => setKifuOpen((o) => !o)}
        keptName={kept ? WAZA_COPY[kept.id].name : null}
        turnLabel={over ? '対局終了' : `手番：${nameOf(position.currentPlayer)}`}
      />

      <div className="controls">
        {!over ? (
          <>
            <button
              type="button"
              className={`btn btn-quiet ${confirm === 'resign' ? 'btn-danger' : ''}`}
              disabled={!started}
              onClick={() => (confirm === 'resign' ? (setConfirm(null), model.resign()) : setConfirm('resign'))}
            >
              {confirm === 'resign' ? '本当に投了する' : '投了'}
            </button>
            <button
              type="button"
              className={`btn btn-quiet ${confirm === 'leave' ? 'btn-danger' : ''}`}
              onClick={() => {
                if (!started) return onLobby()
                if (confirm !== 'leave') return setConfirm('leave')
                // Leave only after the resignation went out: leaving closes the
                // connection, and a lost resignation would become a 60 s disconnect.
                void Promise.resolve(model.resign()).finally(onLobby)
              }}
            >
              {confirm === 'leave' ? '投了して戻る' : 'ロビーに戻る'}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={onAgain}>
              {againLabel}
            </button>
            <button type="button" className="btn btn-quiet" onClick={onLobby}>
              ロビーに戻る
            </button>
          </>
        )}
      </div>

      <Modal
        open={blocker.status === 'blocked'}
        title="対局中です"
        onClose={() => blocker.reset?.()}
        className="modal-narrow"
      >
        <p>このページを離れると投了になります。</p>
        <button
          type="button"
          className="btn btn-danger result-next"
          disabled={leaving}
          onClick={() => {
            setLeaving(true)
            void Promise.resolve(model.resign()).finally(() => blocker.proceed?.())
          }}
        >
          投了して移動する
        </button>
        <button type="button" className="btn btn-quiet result-next" onClick={() => blocker.reset?.()}>
          対局を続ける
        </button>
      </Modal>

      <Modal open={resultOpen} title={title} onClose={() => setResultOpen(false)} className={`modal-result result-${tone}`}>
        <p className="result-sub">
          {moves.length}手・{REASON[match.result_reason ?? ''] ?? '終局'}
        </p>
        {rating && (
          <div className="rating-change">
            <span>実力値</span>
            <strong>{rating.rating}</strong>
            <span className={rating.delta >= 0 ? 'delta-up' : 'delta-down'}>
              {rating.delta > 0 ? `+${rating.delta}` : rating.delta === 0 ? '±0' : rating.delta}
            </span>
          </div>
        )}
        {rating?.promoted && (
          <p className="result-unlock" role="status">
            {rating.promoted}に{rating.promoted.endsWith('段') ? '昇段' : '昇級'}しました！
          </p>
        )}
        {model.kind === 'bot' && model.report?.status === 'done' && !model.report.outcome.rated && (
          <p className="result-note">
            {model.report.outcome.skipped === 'daily_limit'
              ? 'COMとの対局が今日の上限に達したため、実力値は変わりません。'
              : model.report.outcome.skipped === 'frozen'
                ? '初段からは、COMとの対局で実力値は変わりません。'
                : 'この対局は実力値に反映されません。'}
          </p>
        )}
        {model.kind === 'bot' && model.report?.status === 'sending' && <p className="result-note">結果を送信しています…</p>}
        {resultOpen && <WazaList entries={waza.summary()} />}
        <RecordSaveNote status={records.status} onRetry={records.retry} />
        <button type="button" className="btn btn-primary result-next" onClick={onAgain}>
          {againLabel}
        </button>
        <button type="button" className="btn btn-quiet result-next" onClick={onLobby}>
          ロビーに戻る
        </button>
      </Modal>
    </div>
  )
}
