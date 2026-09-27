import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { OnlinePage } from '../games/shogi/ui/online/OnlinePage'
import { ModeTabs } from '../site/ModeTabs'

// Prerendered; the invite parameter (?room=CODE) is applied after hydration.
export const Route = createFileRoute('/online')({
  validateSearch: (search: Record<string, unknown>): { room?: string } =>
    typeof search.room === 'string' ? { room: search.room } : {},
  head: () => ({ meta: [{ title: 'だれかと将棋 — オンライン対局' }] }),
  component: Online,
})

function Online() {
  const { room } = Route.useSearch()
  const [roomParam, setRoomParam] = useState<string | null>(null)
  useEffect(() => setRoomParam(room ?? null), [room])
  return (
    <main className="px-2 py-4 sm:py-8">
      <ModeTabs current="online" />
      <h1 className="sr-only">だれかと将棋を指す（オンライン対局）</h1>
      <OnlinePage roomParam={roomParam} />
    </main>
  )
}
