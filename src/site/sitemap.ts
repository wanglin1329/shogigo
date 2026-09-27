// SPDX-License-Identifier: GPL-3.0-only

// sitemap.xml and robots.txt, prerendered to static files at build time
// (docs/PLAN.md §9.5-5). <lastmod> comes from src/content/lastmod.ts only.

import { LASTMOD } from '../content/lastmod'
import type { SitePath } from '../content/lastmod'
import { CONTACT_EMAIL, absoluteUrl } from './config'

/** Indexable pages, in sitemap order. /records (personal) and /tsume (placeholder) stay out. */
export function sitemapPaths(): SitePath[] {
  return (Object.keys(LASTMOD) as SitePath[]).filter((path) => path !== '/contact' || CONTACT_EMAIL !== '')
}

export function sitemapXml(): string {
  const urls = sitemapPaths()
    .map((path) => `  <url>\n    <loc>${absoluteUrl(path)}</loc>\n    <lastmod>${LASTMOD[path]}</lastmod>\n  </url>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

export function robotsTxt(): string {
  return `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${absoluteUrl('/sitemap.xml')}\n`
}
