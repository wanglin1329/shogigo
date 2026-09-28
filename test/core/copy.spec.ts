// SPDX-License-Identifier: GPL-3.0-only

// The search-facing copy rules (docs/PLAN.md §9.5-3): exact limits, checked
// on every build. Sentence patterns shared between pages are reviewed by hand.

import { describe, expect, it } from 'vitest'

import { HOME_COPY } from '../../src/content/home'
import { LASTMOD } from '../../src/content/lastmod'
import { ONLINE_COPY } from '../../src/content/online'
import type { PageCopy } from '../../src/content/types'
import { absoluteUrl } from '../../src/site/config'
import { robotsTxt, sitemapEntries, sitemapXml } from '../../src/site/sitemap'

const PAGES: Record<string, PageCopy> = { '/': HOME_COPY, '/online': ONLINE_COPY }
const BANNED = ['登録', 'ダウンロード', 'インストール']
/** Characters counted like the SERP does: every code point is one. */
const len = (s: string) => [...s].length

/** Position (1-based) of the last 。 within the first 60 characters. */
function lastStopWithin60(s: string): number {
  return [...s].slice(0, 60).lastIndexOf('。') + 1
}

describe.each(Object.entries(PAGES))('copy of %s', (_path, copy) => {
  const name = copy.title.split('｜')[0]

  it('title: 「名｜説明」, at most 28 characters', () => {
    expect(copy.title).toContain('｜')
    expect(len(copy.title)).toBeLessThanOrEqual(28)
  })

  it('description: 75–80 characters, a 。 at 55–60, the name and 無料 before it', () => {
    expect(len(copy.description)).toBeGreaterThanOrEqual(75)
    expect(len(copy.description)).toBeLessThanOrEqual(80)
    const stop = lastStopWithin60(copy.description)
    expect(stop).toBeGreaterThanOrEqual(55)
    const head = [...copy.description].slice(0, stop).join('')
    expect(head).toContain('無料')
    expect(head.startsWith(name.slice(0, 2))).toBe(true)
  })

  it('lead: 75–80 characters, a definition 「〇〇は、」, a 。 at 55–60', () => {
    expect(len(copy.lead)).toBeGreaterThanOrEqual(75)
    expect(len(copy.lead)).toBeLessThanOrEqual(80)
    expect(copy.lead.slice(0, 16)).toMatch(/^将棋.*は、/)
    expect(lastStopWithin60(copy.lead)).toBeGreaterThanOrEqual(55)
  })

  it('never mentions 登録 / ダウンロード / インストール', () => {
    const all = [copy.title, copy.description, copy.lead, copy.h1, ...copy.faq.flatMap((f) => [f.q, f.a])].join('\n')
    for (const word of BANNED) expect(all).not.toContain(word)
  })
})

describe('copy across pages', () => {
  it('descriptions and leads end differently (no templated pages)', () => {
    const tails = (key: 'description' | 'lead') => Object.values(PAGES).map((c) => [...c[key]].slice(-8).join(''))
    for (const key of ['description', 'lead'] as const) {
      expect(new Set(tails(key)).size).toBe(Object.keys(PAGES).length)
    }
  })

  it('titles are unique', () => {
    expect(new Set(Object.values(PAGES).map((c) => c.title)).size).toBe(Object.keys(PAGES).length)
  })
})

describe('sitemap and robots', () => {
  it('canonical URLs have no trailing slash (except the home page)', () => {
    expect(absoluteUrl('/')).toMatch(/\/$/)
    expect(absoluteUrl('/online')).not.toMatch(/\/$/)
  })

  it('lists every dated page with its own date, and nothing else', () => {
    const xml = sitemapXml()
    const entries = sitemapEntries()
    for (const { path, lastmod } of entries) {
      expect(xml).toContain(`<loc>${absoluteUrl(path)}</loc>\n    <lastmod>${lastmod}</lastmod>`)
      if (path in LASTMOD && path !== '/guide') expect(lastmod).toBe(LASTMOD[path as keyof typeof LASTMOD])
    }
    expect(xml.match(/<url>/g)?.length).toBe(entries.length)
    expect(new Set(entries.map((e) => e.path)).size).toBe(entries.length)
    expect(xml).not.toContain('/records')
    expect(xml).not.toContain('/tsume')
  })

  it('robots.txt keeps crawlers out of the API and points to the sitemap', () => {
    expect(robotsTxt()).toContain('Disallow: /api/')
    expect(robotsTxt()).toContain(`Sitemap: ${absoluteUrl('/sitemap.xml')}`)
  })
})

describe('guide table of contents date', () => {
  it('is the newest of its own date and the chapters', async () => {
    const { CHAPTERS } = await import('../../src/content/guide/chapters')
    const entry = sitemapEntries().find((e) => e.path === '/guide')!
    const newest = [LASTMOD['/guide'], ...CHAPTERS.map((c) => c.updatedAt)].sort().at(-1)
    expect(entry.lastmod).toBe(newest)
  })
})
