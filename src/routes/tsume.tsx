import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import { jstDate, secondsUntilJstMidnight } from '../site/jst'

// Rendered per request (excluded from prerendering via src/site/ssr-routes.json):
// the problem set changes at JST midnight without a redeploy.
const getToday = createServerFn({ method: 'GET' }).handler(() => {
  const nowMs = Date.now()
  return { date: jstDate(nowMs), nowMs }
})

export const Route = createFileRoute('/tsume')({
  loader: () => getToday(),
  // Placeholder until P4: crawlable but never indexed, not in the sitemap, not linked.
  head: () => ({ meta: [{ title: '詰将棋（準備中）' }, { name: 'robots', content: 'noindex' }] }),
  // Edge-cached until the next JST midnight; browsers always revalidate. The
  // TTL uses the same instant the date was computed from, so a render that
  // straddles midnight cannot pin yesterday's page for a whole new day.
  headers: ({ loaderData }): Record<string, string> =>
    loaderData
      ? {
          'Cache-Control': 'public, max-age=0, must-revalidate',
          'Cloudflare-CDN-Cache-Control': `max-age=${secondsUntilJstMidnight(loaderData.nowMs)}`,
        }
      : { 'Cache-Control': 'no-store' },
  component: Tsume,
})

function Tsume() {
  const { date, nowMs } = Route.useLoaderData()
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-bold">今日の詰将棋（P0 基盤）</h1>
      <p className="mt-4" data-testid="jst-date">
        {date}
      </p>
      <p className="mt-2 text-sm opacity-70">rendered at {new Date(nowMs).toISOString()}</p>
    </main>
  )
}
