import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { ONLINE_COPY, OnlineGuide } from '../content/online'
import { OnlinePage } from '../games/shogi/ui/online/OnlinePage'
import { SITE_NAME } from '../site/brand'
import { ModeTabs } from '../site/ModeTabs'
import { breadcrumb, gameJsonLd, pageHead } from '../site/seo'

const OG_IMAGE = '/og/online.jpg'

// Prerendered; the invite parameter (?room=CODE) is applied after hydration.
export const Route = createFileRoute('/online')({
  validateSearch: (search: Record<string, unknown>): { room?: string } =>
    typeof search.room === 'string' ? { room: search.room } : {},
  head: () =>
    pageHead({ path: '/online', title: ONLINE_COPY.title, description: ONLINE_COPY.description, ogImage: OG_IMAGE, pieceFont: true }, [
      breadcrumb([
        { name: SITE_NAME, path: '/' },
        { name: 'オンライン対局', path: '/online' },
      ]),
      gameJsonLd({ name: ONLINE_COPY.h1, description: ONLINE_COPY.description, path: '/online', ogImage: OG_IMAGE }),
    ]),
  component: Online,
})

function Online() {
  const { room } = Route.useSearch()
  const [roomParam, setRoomParam] = useState<string | null>(null)
  useEffect(() => setRoomParam(room ?? null), [room])
  return (
    <main className="px-2 pb-4">
      <ModeTabs current="online" />
      <h1 className="sr-only">{ONLINE_COPY.h1}</h1>
      <OnlinePage roomParam={roomParam} />
      <OnlineGuide />
    </main>
  )
}
