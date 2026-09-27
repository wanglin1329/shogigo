import { useEffect, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'

// Prerendered page. Search params (e.g. `?k=` kifu links) are typed here but
// only applied after hydration: the static HTML was rendered without them, so
// rendering them on the first pass would not match (docs/PLAN.md §2.1).
export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { k?: string } =>
    typeof search.k === 'string' ? { k: search.k } : {},
  component: Home,
})

function Home() {
  const { k } = Route.useSearch()
  const [kifuParam, setKifuParam] = useState<string | null>(null)
  useEffect(() => setKifuParam(k ?? null), [k])

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-bold">将棋（P0 基盤）</h1>
      <p className="mt-4">対局画面は P1 で実装します。</p>
      <p className="mt-2" data-testid="kifu-param">
        {kifuParam ? `棋譜パラメータ: ${kifuParam}` : '棋譜パラメータなし'}
      </p>
      <nav className="mt-6 flex gap-4 underline">
        <Link to="/board">将棋盤</Link>
        <Link to="/tsume">今日の詰将棋</Link>
      </nav>
    </main>
  )
}
