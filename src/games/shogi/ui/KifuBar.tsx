// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useMemo, useRef, useState } from 'react'

import { formatKif } from '../core/kifu/kif'
import { buildNotation } from '../core/kifu/notation'
import type { NotationEntry } from '../core/kifu/notation'
import { encodeKifuParam } from '../core/kifu/url'
import type { GameView } from '../core/record'
import { lineShareUrl, openExternal, xShareUrl } from '../../../site/share'

export function shareUrl(view: GameView): string | null {
  const k = encodeKifuParam({ initialSfen: view.record.initialSfen, usiMoves: view.record.moves })
  if (!k || typeof location === 'undefined') return null
  return `${location.origin}/?k=${k}&m=${view.cursor}`
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}


export function KifuBar({
  view,
  open,
  onToggle,
  onJump,
  turnLabel,
}: {
  view: GameView
  open: boolean
  onToggle: () => void
  onJump: (cursor: number) => void
  turnLabel: string
}) {
  // Notation is rebuilt only for moves not seen before (buildNotation reuses the prefix).
  const cache = useRef<{ initialSfen: string | null; entries: NotationEntry[] }>({ initialSfen: null, entries: [] })
  const entries = useMemo(() => {
    const prev = cache.current.initialSfen === view.record.initialSfen ? cache.current.entries : undefined
    const built = buildNotation(view.record.initialSfen, view.record.moves, undefined, prev)
    cache.current = { initialSfen: view.record.initialSfen, entries: built }
    return built
  }, [view.record])

  const [copied, setCopied] = useState<string | null>(null)
  const listRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, view.cursor])

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(null), 1800)
    return () => clearTimeout(t)
  }, [copied])

  const current = view.cursor > 0 ? entries[view.cursor - 1] : null

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
    } catch {
      setCopied('failed')
    }
  }

  const url = open ? shareUrl(view) : null
  const plies = view.record.moves.length
  const shareText = `将棋の対局（${plies}手）`

  return (
    <section className={`kifu ${open ? 'kifu-open' : ''}`}>
      <button type="button" className="kifu-summary" aria-expanded={open} onClick={onToggle}>
        <span className="kifu-caret" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        <span className="kifu-title">棋譜</span>
        <span className="kifu-current">{current ? `${current.ply}手目 ${current.text}` : '開始局面'}</span>
        <span className="kifu-turn">{turnLabel}</span>
      </button>
      {open && (
        <div className="kifu-panel">
          {entries.length === 0 ? (
            <p className="kifu-empty">まだ指し手がありません</p>
          ) : (
            <ol className="kifu-list" ref={listRef}>
              <li>
                <button type="button" aria-current={view.cursor === 0} onClick={() => onJump(0)}>
                  開始局面
                </button>
              </li>
              {entries.map((e) => (
                <li key={e.ply}>
                  <button type="button" aria-current={view.cursor === e.ply} onClick={() => onJump(e.ply)}>
                    <span className="kifu-ply">{e.ply}</span>
                    {e.text}
                  </button>
                </li>
              ))}
            </ol>
          )}
          <div className="kifu-actions">
            <button type="button" className="chip" disabled={!url} onClick={() => url && copy(url, 'url')}>
              {copied === 'url' ? 'コピーしました' : 'リンクをコピー'}
            </button>
            <button
              type="button"
              className="chip"
              disabled={!url}
              onClick={() =>
                url &&
                openExternal(xShareUrl(`${shareText}\n${url}`))
              }
            >
              Xで共有
            </button>
            <button
              type="button"
              className="chip"
              disabled={!url}
              onClick={() => url && openExternal(lineShareUrl(`${shareText}\n${url}`))}
            >
              LINEで送る
            </button>
            <button
              type="button"
              className="chip"
              disabled={plies === 0}
              onClick={() => copy(formatKif(view.record.initialSfen, view.record.moves), 'kif')}
            >
              {copied === 'kif' ? 'コピーしました' : 'KIFをコピー'}
            </button>
            <button
              type="button"
              className="chip"
              disabled={plies === 0}
              onClick={() => download(`shogi-${stamp()}.kif`, formatKif(view.record.initialSfen, view.record.moves))}
            >
              KIFを保存
            </button>
          </div>
          {copied === 'failed' && <p className="kifu-error">コピーできませんでした。長押しで選択してコピーしてください。</p>}
        </div>
      )}
    </section>
  )
}
