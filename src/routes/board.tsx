import { createFileRoute } from '@tanstack/react-router'

import { BOARD_COPY, BoardGuide } from '../content/board'
import { BoardMode } from '../games/shogi/ui/BoardMode'
import { SITE_NAME } from '../site/brand'
import { ModeTabs } from '../site/ModeTabs'
import { breadcrumb, gameJsonLd, pageHead } from '../site/seo'

const OG_IMAGE = '/og/board.jpg'

export const Route = createFileRoute('/board')({
  head: () =>
    pageHead({ path: '/board', title: BOARD_COPY.title, description: BOARD_COPY.description, ogImage: OG_IMAGE, pieceFont: true }, [
      breadcrumb([
        { name: SITE_NAME, path: '/' },
        { name: '将棋盤', path: '/board' },
      ]),
      gameJsonLd({ name: BOARD_COPY.h1, description: BOARD_COPY.description, path: '/board', ogImage: OG_IMAGE }),
    ]),
  component: Board,
})

function Board() {
  return (
    <main className="px-2 pb-4">
      <ModeTabs current="board" />
      <h1 className="sr-only">{BOARD_COPY.h1}</h1>
      <BoardMode />
      <BoardGuide />
    </main>
  )
}
