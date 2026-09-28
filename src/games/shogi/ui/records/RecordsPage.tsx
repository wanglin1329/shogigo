// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

import { opponentLabel, reasonLabel, resultLabel, resultTone, winRate } from '../../core/records/model'
import type { GameCursor, GameRecord, RecordMode, Summary } from '../../core/records/types'
import { encodeKifuParam } from '../../core/kifu/url'
import { loadRecordsStore } from '../../records'

const PAGE = 20

const TABS: { mode: RecordMode; label: string }[] = [
  { mode: 'all', label: 'すべて' },
  { mode: 'ai', label: 'AI' },
  { mode: 'online', label: 'だれかと' },
]

export function isRecordMode(value: unknown): value is RecordMode {
  return TABS.some((t) => t.mode === value)
}

function formatDate(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Opens the game in the kifu viewer on the homepage (final position). */
function viewerHref(game: GameRecord): string | null {
  const k = encodeKifuParam({ initialSfen: game.initialSfen, usiMoves: game.moves })
  return k ? `/?k=${k}&m=${game.moves.length}` : null
}

type Load =
  | { state: 'loading' }
  | { state: 'unavailable' }
  | { state: 'error'; message: string }
  | { state: 'ready'; summary: Summary; games: GameRecord[]; next: GameCursor | null }

export function RecordsPage({ tab, onTab }: { tab: RecordMode; onTab: (mode: RecordMode) => void }) {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [loadingMore, setLoadingMore] = useState(false)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const currentTab = useRef(tab)
  currentTab.current = tab

  useEffect(() => {
    let alive = true
    setLoad({ state: 'loading' })
    if (typeof indexedDB === 'undefined') {
      setLoad({ state: 'unavailable' })
      return
    }
    void loadRecordsStore()
      .then(async (store) => {
        const [summary, page] = await Promise.all([store.getSummary(tab), store.getGames({ mode: tab, limit: PAGE })])
        if (alive) setLoad({ state: 'ready', summary, games: page.games, next: page.nextCursor })
      })
      .catch((error: unknown) => {
        if (alive) setLoad({ state: 'error', message: error instanceof Error ? error.message : String(error) })
      })
    return () => {
      alive = false
    }
  }, [tab])

  async function showMore() {
    if (load.state !== 'ready' || !load.next) return
    const requested = tab
    setLoadingMore(true)
    try {
      const store = await loadRecordsStore()
      const page = await store.getGames({ mode: requested, limit: PAGE, cursor: load.next })
      // The tab may have changed while this page was loading: it belongs to the old one.
      if (currentTab.current !== requested) return
      setLoad((current) =>
        current.state === 'ready' ? { ...current, games: [...current.games, ...page.games], next: page.nextCursor } : current,
      )
    } catch {
      // Leave the list as it is; 「もっと見る」 stays to try again.
    } finally {
      setLoadingMore(false)
    }
  }

  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((t) => t.mode === tab)
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % TABS.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + TABS.length) % TABS.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? TABS.length - 1
              : -1
    if (next < 0) return
    event.preventDefault()
    onTab(TABS[next].mode)
    tabRefs.current[next]?.focus()
  }

  return (
    <div className="records">
      <div className="records-tabs" role="tablist" aria-label="戦績の種類" onKeyDown={onTabKey}>
        {TABS.map((t, i) => (
          <button
            key={t.mode}
            ref={(el) => {
              tabRefs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`records-tab-${t.mode}`}
            aria-selected={tab === t.mode}
            aria-controls="records-panel"
            tabIndex={tab === t.mode ? 0 : -1}
            className="records-tab"
            onClick={() => onTab(t.mode)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section id="records-panel" role="tabpanel" aria-labelledby={`records-tab-${tab}`} className="records-panel">
        {load.state === 'loading' && <p className="records-note">読み込んでいます…</p>}
        {load.state === 'unavailable' && (
          <p className="records-note">このブラウザでは戦績を保存できません（プライベートブラウズでは保存されないことがあります）。</p>
        )}
        {load.state === 'error' && (
          <p className="records-note" role="alert">
            戦績を読み込めませんでした。ページを再読み込みしてください。
          </p>
        )}
        {load.state === 'ready' && <Ready load={load} loadingMore={loadingMore} onMore={() => void showMore()} />}
      </section>
    </div>
  )
}

function Ready({
  load,
  loadingMore,
  onMore,
}: {
  load: Extract<Load, { state: 'ready' }>
  loadingMore: boolean
  onMore: () => void
}) {
  const { summary, games } = load
  if (summary.games === 0 && games.length === 0) {
    return (
      <div className="records-empty">
        <p>まだ記録がありません。対局が終わると、ここに自動で残ります。</p>
        <div className="records-empty-links">
          <a className="btn btn-primary" href="/">
            AIと対局する
          </a>
          <a className="btn btn-quiet" href="/online">
            だれかと対局する
          </a>
        </div>
      </div>
    )
  }
  const rate = winRate(summary)
  return (
    <>
      <dl className="records-summary">
        <div>
          <dt>対局数</dt>
          <dd>{summary.games}</dd>
        </div>
        <div>
          <dt>勝率</dt>
          <dd>{rate === null ? '—' : `${rate}%`}</dd>
        </div>
        <div>
          <dt>勝ち・負け</dt>
          <dd>
            {summary.wins}勝 {summary.losses}敗{summary.draws > 0 ? ` ${summary.draws}分` : ''}
          </dd>
        </div>
      </dl>
      <ol className="records-list">
        {games.map((game) => {
          const href = viewerHref(game)
          const body = (
            <>
              <span className={`records-result records-${resultTone(game)}`}>{resultLabel(game)}</span>
              <span className="records-main">
                <span className="records-opponent">{opponentLabel(game)}</span>
                <span className="records-meta">
                  {reasonLabel(game.reason)}・{game.moves.length}手・{formatDate(game.endedAt)}
                </span>
              </span>
            </>
          )
          return (
            <li key={game.id}>
              {href ? (
                <a className="records-row" href={href} target="_blank" rel="noopener" aria-label={`${resultLabel(game)}・${opponentLabel(game)}・棋譜を新しいタブで開く`}>
                  {body}
                  <span className="records-open" aria-hidden="true">
                    ↗
                  </span>
                </a>
              ) : (
                <div className="records-row">{body}</div>
              )}
            </li>
          )
        })}
      </ol>
      {load.next && (
        <button type="button" className="btn btn-quiet records-more" disabled={loadingMore} onClick={onMore}>
          {loadingMore ? '読み込み中…' : 'もっと見る'}
        </button>
      )}
    </>
  )
}
