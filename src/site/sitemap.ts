// SPDX-License-Identifier: GPL-3.0-only

// sitemap.xml and robots.txt, prerendered to static files at build time
// (docs/PLAN.md §9.5-5). <lastmod> comes from src/content/lastmod.ts only.

import { CHAPTERS } from '../content/guide/chapters'
import { LASTMOD } from '../content/lastmod'
import type { SitePath } from '../content/lastmod'
import { CONTACT_EMAIL, absoluteUrl } from './config'

/**
 * Indexable pages with their dates, in sitemap order: the pages dated in
 * LASTMOD, then the guide chapters (dated by their own updatedAt — one source
 * per date). /records (personal) and /tsume (placeholder) stay out.
 */
export function sitemapEntries(): { path: string; lastmod: string }[] {
  const chapters = CHAPTERS.map((c) => ({ path: `/guide/${c.slug}`, lastmod: c.updatedAt }))
  // The table of contents shows every chapter's title and summary: it changes
  // whenever a chapter does, so it takes the newest of its own and their dates.
  const guideIndex = [LASTMOD['/guide'], ...chapters.map((c) => c.lastmod)].sort().at(-1)!
  const pages = (Object.keys(LASTMOD) as SitePath[])
    .filter((path) => path !== '/contact' || CONTACT_EMAIL !== '')
    .map((path) => ({ path, lastmod: path === '/guide' ? guideIndex : LASTMOD[path] }))
  return [...pages, ...chapters]
}

export function sitemapXml(): string {
  const urls = sitemapEntries()
    .map(({ path, lastmod }) => `  <url>\n    <loc>${absoluteUrl(path)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

export function robotsTxt(): string {
  return `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${absoluteUrl('/sitemap.xml')}\n`
}
