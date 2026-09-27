import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { ShogiGame } from '../games/shogi/ui/ShogiGame'
import type { SharedKifuLink } from '../games/shogi/ui/ShogiGame'

// Prerendered page. Search params (e.g. `?k=` kifu links) are typed here but
// only applied after hydration: the static HTML was rendered without them, so
// rendering them on the first pass would not match (docs/PLAN.md §2.1).
export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { k?: string; m?: number } => ({
    ...(typeof search.k === 'string' ? { k: search.k } : {}),
    ...(typeof search.m === 'number' || typeof search.m === 'string' ? { m: Number(search.m) } : {}),
  }),
  component: Home,
})

function Home() {
  const { k, m } = Route.useSearch()
  const [shared, setShared] = useState<SharedKifuLink | null>(null)
  useEffect(() => setShared(k ? { k, m: m !== undefined && Number.isFinite(m) ? m : null } : null), [k, m])

  return (
    <main className="px-2 py-4 sm:py-8">
      <h1 className="sr-only">将棋 — AIと対局</h1>
      <ShogiGame shared={shared} />
    </main>
  )
}
