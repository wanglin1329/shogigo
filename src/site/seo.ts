// SPDX-License-Identifier: GPL-3.0-only

// <head> for every page (docs/PLAN.md §9.5-5): title, description, canonical,
// Open Graph, Twitter card and JSON-LD, all from one place.

import { OPERATOR, SITE_NAME } from './brand'
import { absoluteUrl } from './config'

export interface PageSeo {
  /** Site path without a trailing slash ('/' for the home page). */
  path: string
  title: string
  description: string
  /** Path of the 1200×630 share image under public/ (default: the site image). */
  ogImage?: string
  noindex?: boolean
  /** Pages with a board on first screen: fetch the piece font along with the CSS. */
  pieceFont?: boolean
  /** 'article' for guide chapters. */
  ogType?: 'website' | 'article'
}

export const DEFAULT_OG_IMAGE = '/og/home.jpg'

export function pageHead(seo: PageSeo, jsonLd: readonly object[] = []) {
  const url = absoluteUrl(seo.path)
  const image = absoluteUrl(seo.ogImage ?? DEFAULT_OG_IMAGE)
  return {
    meta: [
      { title: seo.title },
      { name: 'description', content: seo.description },
      ...(seo.noindex ? [{ name: 'robots', content: 'noindex' }] : []),
      { property: 'og:type', content: seo.ogType ?? 'website' },
      { property: 'og:site_name', content: SITE_NAME },
      { property: 'og:locale', content: 'ja_JP' },
      { property: 'og:title', content: seo.title },
      { property: 'og:description', content: seo.description },
      { property: 'og:url', content: url },
      { property: 'og:image', content: image },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [
      { rel: 'canonical', href: url },
      ...(seo.pieceFont
        ? [{ rel: 'preload', href: '/fonts/shippori-mincho-b1-700-pieces.woff2', as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' as const }]
        : []),
    ],
    scripts: jsonLd.map((data) => ({ type: 'application/ld+json', children: JSON.stringify(data) })),
  }
}

/** 「shogigo › 将棋盤」 as structured data. */
export function breadcrumb(items: readonly { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }
}

const ORGANIZATION = () => ({
  '@type': 'Organization',
  name: OPERATOR,
  url: absoluteUrl('/'),
  logo: absoluteUrl('/logo-512.png'),
})

/** Home page: the site itself and who runs it. */
export function siteJsonLd() {
  return [
    { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: absoluteUrl('/'), inLanguage: 'ja' },
    { '@context': 'https://schema.org', ...ORGANIZATION() },
  ]
}

/** A playable page. `description` must be the page's meta description, word for word. */
export function gameJsonLd(game: { name: string; description: string; path: string; ogImage: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: game.name,
    description: game.description,
    url: absoluteUrl(game.path),
    image: absoluteUrl(game.ogImage),
    inLanguage: 'ja',
    genre: 'ボードゲーム',
    gamePlatform: 'Webブラウザ',
    applicationCategory: 'GameApplication',
    operatingSystem: 'Any',
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'JPY' },
    publisher: ORGANIZATION(),
  }
}
