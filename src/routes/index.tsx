import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { HOME_COPY, HomeGuide } from '../content/home'
import { ShogiGame } from '../games/shogi/ui/ShogiGame'
import type { SharedKifuLink } from '../games/shogi/ui/ShogiGame'
import { ModeTabs } from '../site/ModeTabs'
import { gameJsonLd, pageHead, siteJsonLd } from '../site/seo'

const OG_IMAGE = '/og/home.jpg'

// Prerendered page. Search params (e.g. `?k=` kifu links) are typed here but
// only applied after hydration: the static HTML was rendered without them, so
// rendering them on the first pass would not match (docs/PLAN.md §2.1).
export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { k?: string; m?: number } => ({
    ...(typeof search.k === 'string' ? { k: search.k } : {}),
    ...(typeof search.m === 'number' || typeof search.m === 'string' ? { m: Number(search.m) } : {}),
  }),
  head: () =>
    pageHead({ path: '/', title: HOME_COPY.title, description: HOME_COPY.description, ogImage: OG_IMAGE, pieceFont: true }, [
      ...siteJsonLd(),
      gameJsonLd({ name: HOME_COPY.h1, description: HOME_COPY.description, path: '/', ogImage: OG_IMAGE }),
    ]),
  component: Home,
})

function Home() {
  const { k, m } = Route.useSearch()
  const [shared, setShared] = useState<SharedKifuLink | null>(null)
  useEffect(() => setShared(k ? { k, m: m !== undefined && Number.isFinite(m) ? m : null } : null), [k, m])

  return (
    <main className="px-2 pb-4">
      <ModeTabs current="ai" />
      <h1 className="sr-only">{HOME_COPY.h1}</h1>
      <ShogiGame shared={shared} />
      <HomeGuide />
    </main>
  )
}
