import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      // Placeholder until the brand is decided (docs/PLAN.md §1.2 D2).
      { title: '将棋' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      // Piece glyphs only (text= subset): a few KB instead of a full Japanese font.
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: `https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@700&display=swap&text=${encodeURIComponent(
          '王玉飛角金銀桂香歩龍馬全圭杏と▲△０１２３４５６７８９一二三四五六七八九同成打',
        )}`,
      },
    ],
  }),
  shellComponent: RootDocument,
  errorComponent: RootError,
})

// Last resort: never leave a blank page. Saved games live in localStorage and
// survive a reload.
function RootError({ reset }: ErrorComponentProps) {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-xl font-bold">表示中に問題が起きました</h1>
      <p className="mt-3 text-sm">対局の途中経過は保存されています。再読み込みすると続きから遊べます。</p>
      <button type="button" className="btn btn-primary mt-6" onClick={() => (reset(), location.reload())}>
        再読み込み
      </button>
    </main>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
