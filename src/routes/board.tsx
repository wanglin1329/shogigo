import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/board')({ component: Board })

function Board() {
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-bold">将棋盤（P0 基盤）</h1>
      <p className="mt-4">プリレンダリングされたページです（board.html）。</p>
    </main>
  )
}
