import { HeadContent, Link, Scripts, createRootRoute } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'

import { SITE_NAME } from '../site/brand'
import { SiteFooter, SiteHeader } from '../site/SiteChrome'
import { PLAUSIBLE_SRC } from '../site/config'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#f4efe4' },
      // Fallback (e.g. the 404 page); every route sets its own.
      { title: SITE_NAME },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'icon', href: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    ],
    // Analytics only when configured (env/.env; docs/PLAN.md §9.5-6).
    scripts: PLAUSIBLE_SRC ? [{ src: PLAUSIBLE_SRC, defer: true }] : [],
  }),
  shellComponent: RootDocument,
  errorComponent: RootError,
  notFoundComponent: NotFound,
})

// Last resort: never leave a blank page. Saved games live in localStorage and
// survive a reload.
function RootError({ reset }: ErrorComponentProps) {
  return (
    <main className="site-page">
      <h1>表示中に問題が起きました</h1>
      <p>対局の途中経過は保存されています。再読み込みすると続きから遊べます。</p>
      <button type="button" className="btn btn-primary" onClick={() => (reset(), location.reload())}>
        再読み込み
      </button>
    </main>
  )
}

function NotFound() {
  return (
    <main className="site-page">
      <h1>ページが見つかりません</h1>
      <p>URLが変わったか、ページが削除された可能性があります。</p>
      <p>
        <Link to="/">将棋を指す（トップページ）</Link>
      </p>
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
        <a className="skip-link" href="#content">
          本文へスキップ
        </a>
        <SiteHeader />
        <div id="content" tabIndex={-1}>
          {children}
        </div>
        <SiteFooter />
        <Scripts />
      </body>
    </html>
  )
}
