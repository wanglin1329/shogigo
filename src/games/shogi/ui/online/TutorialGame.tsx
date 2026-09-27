// SPDX-License-Identifier: GPL-3.0-only

import { useMemo, useRef, useState } from 'react'

import type { Move } from '../../core/engine'
import { parseUsiMove } from '../../core/kifu/moves'
import { currentState, openRecord, play, resign, visibleOutcome } from '../../core/record'
import type { GameView } from '../../core/record'
import { materialBalance, nextTutorialLevel, tutorialPlay } from '../../core/tutorial'
import type { TutorialLevel } from '../../core/tutorial'
import { markTutorialDone } from '../../online/unlock'
import { Modal } from '../../../../site/Modal'
import type { MoveAnimation } from '../Board'
import { playMoveSound } from '../feedback'
import { GameBoard } from '../GameBoard'
import { RESULT_REASON } from '../messages'
import type { ShogiSettings } from '../settings'
import { positionKey, useAiOpponent } from '../useAiOpponent'
import { useBoardInput } from '../useBoardInput'

/**
 * Practice game against a COM that goes easier whenever the player falls
 * behind (never harder again). Winning it unlocks random matching.
 */
export function TutorialGame({ settings, onLobby, onSeek }: { settings: ShogiSettings; onLobby: () => void; onSeek: () => void }) {
  const [view, setView] = useState<GameView>(() => openRecord({ initialSfen: null, moves: [] }))
  const [level, setLevel] = useState<TutorialLevel>(0)
  const [animation, setAnimation] = useState<MoveAnimation | null>(null)
  const [resultOpen, setResultOpen] = useState(false)
  const [confirmResign, setConfirmResign] = useState(false)
  const turnStarted = useRef(Date.now())
  const seq = useRef(0)

  const state = currentState(view)
  const outcome = visibleOutcome(view)
  const com = tutorialPlay(level)
  const tuning = useMemo(() => ({ weakness: tutorialPlay(level).weakness, joseki: false }), [level])

  function apply(next: GameView, move: Move) {
    setView(next)
    setAnimation({ from: move.type === 'move' ? { x: move.fromX, y: move.fromY } : null, to: { x: move.toX, y: move.toY }, id: ++seq.current })
    if (settings.sound) playMoveSound()
    const done = visibleOutcome(next)
    if (done) {
      if (done.winner === 'sente') markTutorialDone()
      setResultOpen(true)
    }
  }

  const ai = useAiOpponent({
    enabled: true,
    view,
    level: com.level,
    aiSide: 'gote',
    tuning,
    callbacks: {
      onMove: (move, key) => {
        if (key !== positionKey(view)) return
        apply(play(view, move), move)
        turnStarted.current = Date.now()
      },
      onResign: (key) => {
        if (key !== positionKey(view)) return
        markTutorialDone()
        setView(resign(view, 'gote'))
        setResultOpen(true)
      },
      onWin: () => {},
      onError: () => {},
    },
  })

  const interactive = !outcome && !ai.thinking && state.currentPlayer === 'sente'
  const input = useBoardInput({
    state,
    interactive,
    moveHints: settings.moveHints,
    onMove: (move) => {
      const next = play(view, move)
      // Decide how kind the COM's reply should be, before it is asked.
      setLevel((current) =>
        nextTutorialLevel(current, {
          balance: materialBalance(currentState(next), 'sente'),
          plies: next.record.moves.length,
          lastThinkMs: Date.now() - turnStarted.current,
        }),
      )
      apply(next, move)
    },
  })

  const lastMove = useMemo(() => {
    const usi = view.record.moves.at(-1)
    const move = usi ? parseUsiMove(usi) : null
    return move ? { x: move.toX, y: move.toY } : null
  }, [view])

  function restart() {
    ai.cancel()
    ai.newGame()
    setView(openRecord({ initialSfen: null, moves: [] }))
    setLevel(0)
    setResultOpen(false)
    turnStarted.current = Date.now()
  }

  const won = outcome?.winner === 'sente'

  return (
    <div className="game">
      <p className="bot-banner" role="note">
        練習対局です。COMは手加減してくれます。勝つと「だれかと対局」ができるようになります。
      </p>
      <GameBoard
        state={state}
        input={input}
        interactive={interactive}
        flipped={false}
        pieceStyle={settings.pieceStyle}
        moveHints={settings.moveHints}
        label={(side) => (side === 'sente' ? 'あなた' : 'COM')}
        lastMove={lastMove}
        animation={animation}
        showCheckLine={false}
      >
        {ai.thinking && (
          <div className="thinking" role="status">
            <span className="thinking-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            考え中
          </div>
        )}
      </GameBoard>
      <div className="controls">
        {!outcome && view.record.moves.length > 0 && (
          <button
            type="button"
            className={`btn btn-quiet ${confirmResign ? 'btn-danger' : ''}`}
            onClick={() => {
              if (!confirmResign) return setConfirmResign(true)
              setConfirmResign(false)
              ai.cancel()
              setView(resign(view, 'sente'))
              setResultOpen(true)
            }}
          >
            {confirmResign ? '本当に投了する' : '投了'}
          </button>
        )}
        <button type="button" className="btn btn-quiet" onClick={onLobby}>
          ロビーに戻る
        </button>
      </div>

      <Modal open={resultOpen && !!outcome} title={won ? 'チュートリアル達成！' : 'COMの勝ち'} onClose={() => setResultOpen(false)} className={`modal-result ${won ? 'result-win' : 'result-lose'}`}>
        {outcome && (
          <p className="result-sub">
            {outcome.plies}手・{RESULT_REASON[outcome.reason] ?? '終局'}
          </p>
        )}
        {won ? (
          <>
            <p>「だれかと対局」ができるようになりました。</p>
            <button type="button" className="btn btn-primary result-next" onClick={onSeek}>
              相手を探す
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-primary result-next" onClick={restart}>
            もう一度挑戦する
          </button>
        )}
        <button type="button" className="btn btn-quiet result-next" onClick={onLobby}>
          ロビーに戻る
        </button>
      </Modal>
    </div>
  )
}
