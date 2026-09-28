// SPDX-License-Identifier: GPL-3.0-only

// When each page's own text last changed: sitemap <lastmod> and 「最終更新日」.
// Edit the date in the same commit as the text. Never use `new Date()` here —
// a sitemap claiming every page changed at every fetch gets its dates ignored.

export const LASTMOD = {
  '/': '2026-09-28',
  '/board': '2026-09-28',
  '/online': '2026-09-28',
  '/about': '2026-09-28',
  '/privacy': '2026-09-28',
  '/terms': '2026-09-28',
  '/contact': '2026-09-28',
  '/license': '2026-09-28',
  /** The guide's table of contents; each chapter carries its own updatedAt. */
  '/guide': '2026-09-28',
} as const satisfies Record<string, string>

export type SitePath = keyof typeof LASTMOD

/** 2026-09-27 → 2026年9月27日 */
export function japaneseDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${y}年${m}月${d}日`
}
