// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import type { Player } from '../core/engine'
import { currentState } from '../core/record'
import type { GameView, Outcome } from '../core/record'
import { Modal } from '../../../site/Modal'
import { lineShareUrl, openExternal, xShareUrl } from '../../../site/share'
import { shareUrl } from './KifuBar'
import { RESULT_REASON } from './messages'
import { Piece } from './Piece'
import type { PieceStyle } from './settings'


/** A small, static copy of the final position (tap to close and see the real board). */
function Thumbnail({ view, flipped, pieceStyle, onClick }: { view: GameView; flipped: boolean; pieceStyle: PieceStyle; onClick: () => void }) {
  const board = currentState(view).board
  const rows = Array.from({ length: 9 }, (_, i) => i)
  return (
    <button type="button" className="result-board" onClick={onClick} aria-label="終局図。タップで盤面に戻る">
      {rows.map((r) =>
        rows.map((c) => {
          const x = flipped ? 8 - c : c
          const y = flipped ? 8 - r : r
          const p = board[y][x]
          return (
            <span key={`${r}-${c}`} className="result-cell">
              {p && <Piece type={p.type} owner={p.owner} style={pieceStyle} flipped={flipped} />}
            </span>
          )
        }),
      )}
    </button>
  )
}

export function ResultDialog({
  open,
  outcome,
  humanSide,
  levelLabel,
  wins,
  unlocked,
  view,
  flipped,
  pieceStyle,
  onClose,
  onNext,
  children,
}: {
  open: boolean
  outcome: Outcome | null
  humanSide: Player
  levelLabel: string
  wins: number
  /** Label of a level unlocked by this win. */
  unlocked: string | null
  view: GameView
  flipped: boolean
  pieceStyle: PieceStyle
  onClose: () => void
  onNext: () => void
  /** Extra lines under the thumbnail (waza of the game, 対局記録). */
  children?: ReactNode
}) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(t)
  }, [copied])
  if (!outcome) return null

  const tone = outcome.winner === 'draw' ? 'draw' : outcome.winner === humanSide ? 'win' : 'lose'
  const title = tone === 'draw' ? '引き分け' : tone === 'win' ? 'あなたの勝ち！' : 'AIの勝ち'
  const reason = RESULT_REASON[outcome.reason] ?? '終局'
  const url = open ? shareUrl(view) : null
  const text = `将棋でAI（${levelLabel}）と対局：${outcome.plies}手・${reason}で${title.replace('！', '')}`

  return (
    <Modal open={open} title={title} onClose={onClose} className={`modal-result result-${tone}`}>
      <p className="result-sub">
        {outcome.plies}手・{reason}
      </p>
      <dl className="result-stats">
        <div>
          <dt>強さ</dt>
          <dd>{levelLabel}</dd>
        </div>
        {wins > 0 && (
          <div>
            <dt>通算勝利</dt>
            <dd>{wins}勝</dd>
          </div>
        )}
      </dl>
      {unlocked && (
        <p className="result-unlock" role="status">
          「{unlocked}」が解放されました
        </p>
      )}
      <Thumbnail view={view} flipped={flipped} pieceStyle={pieceStyle} onClick={onClose} />
      {children}
      <div className="result-share">
        <button
          type="button"
          className="chip"
          disabled={!url}
          onClick={async () => {
            if (!url) return
            try {
              await navigator.clipboard.writeText(url)
              setCopied(true)
            } catch {
              // Clipboard blocked: nothing else to do here; the kifu bar offers other ways.
            }
          }}
        >
          {copied ? 'コピーしました' : '棋譜のリンクをコピー'}
        </button>
        <button
          type="button"
          className="chip"
          disabled={!url}
          onClick={() => url && openExternal(xShareUrl(`${text}\n${url}`))}
        >
          Xで共有
        </button>
        <button
          type="button"
          className="chip"
          disabled={!url}
          onClick={() => url && openExternal(lineShareUrl(`${text}\n${url}`))}
        >
          LINEで送る
        </button>
      </div>
      <button type="button" className="btn btn-primary result-next" onClick={onNext}>
        {unlocked ? `${unlocked}に挑戦する` : '次の対局へ'}
      </button>
    </Modal>
  )
}
