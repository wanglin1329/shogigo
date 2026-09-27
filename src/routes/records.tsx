import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'

import type { RecordMode } from '../games/shogi/core/records/types'
import { RecordsPage, isRecordMode } from '../games/shogi/ui/records/RecordsPage'

// Personal data kept in this browser only: prerendered shell, never indexed.
export const Route = createFileRoute('/records')({
  validateSearch: (search: Record<string, unknown>): { tab?: RecordMode } =>
    isRecordMode(search.tab) && search.tab !== 'all' ? { tab: search.tab } : {},
  head: () => ({
    meta: [{ title: '戦績' }, { name: 'robots', content: 'noindex' }],
  }),
  component: Records,
})

function Records() {
  const { tab: searchTab } = Route.useSearch()
  const navigate = useNavigate({ from: '/records' })
  // The static HTML is rendered for 「すべて」; the tab from the URL applies after hydration.
  const [tab, setTab] = useState<RecordMode>('all')
  useEffect(() => setTab(searchTab ?? 'all'), [searchTab])

  return (
    <main className="px-2 py-4 sm:py-8">
      <h1 className="records-title">戦績</h1>
      <p className="records-lead">このブラウザに保存された対局の記録です。棋譜を選ぶと新しいタブで開きます。</p>
      <RecordsPage
        tab={tab}
        onTab={(mode) => {
          setTab(mode)
          void navigate({ search: mode === 'all' ? {} : { tab: mode }, replace: true })
        }}
      />
    </main>
  )
}
