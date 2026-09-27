import { createFileRoute } from '@tanstack/react-router'

import { BoardMode } from '../games/shogi/ui/BoardMode'
import { ModeTabs } from '../site/ModeTabs'

export const Route = createFileRoute('/board')({
  head: () => ({ meta: [{ title: '将棋盤 — ふたりで指す' }] }),
  component: Board,
})

function Board() {
  return (
    <main className="px-2 py-4 sm:py-8">
      <ModeTabs current="board" />
      <h1 className="sr-only">将棋盤（ひとつの端末でふたりで指す）</h1>
      <BoardMode />
    </main>
  )
}
