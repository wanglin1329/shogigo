// SPDX-License-Identifier: GPL-3.0-only

// Rules guide (docs/PLAN.md §9.7): search copy limits, figure data, links.

import { describe, expect, it } from 'vitest'

import { CHAPTERS } from '../../src/content/guide/chapters'
import { parseToken, square } from '../../src/content/guide/diagram'
import type { Diagram } from '../../src/content/guide/diagram'
import { GUIDE_COPY } from '../../src/content/guide'
import { links } from '../../src/content/guide/Rich'
import type { Block, Chapter } from '../../src/content/guide/types'

const BANNED = ['登録', 'ダウンロード', 'インストール']
const len = (s: string) => [...s].length
const lastStopWithin60 = (s: string) => [...s].slice(0, 60).lastIndexOf('。') + 1

/** Every text of a chapter, for the banned-word and link checks. */
function texts(c: Chapter): string[] {
  const fromBlock = (b: Block): string[] => {
    switch (b.kind) {
      case 'p':
        return [b.text]
      case 'list':
        return [...b.items]
      case 'table':
        return [...b.head, ...b.rows.flat(), b.caption ?? '']
      case 'note':
        return [b.title, b.text]
      case 'figures':
        return b.diagrams.flatMap((d) => [d.caption, d.alt])
    }
  }
  return [
    c.title,
    c.metaTitle,
    c.description,
    c.lead,
    c.summary,
    ...c.takeaway,
    ...c.sections.flatMap((s) => [s.heading, ...s.blocks.flatMap(fromBlock)]),
  ]
}

function diagrams(c: Chapter): Diagram[] {
  return [c.hero, ...c.sections.flatMap((s) => s.blocks.flatMap((b) => (b.kind === 'figures' ? [...b.diagrams] : [])))]
}

const ROUTES = new Set(['/', '/board', '/online', '/records', '/guide', ...CHAPTERS.map((c) => `/guide/${c.slug}`)])

function checkSearchCopy(metaTitle: string, description: string, lead: string) {
  expect(metaTitle).toContain('｜')
  expect(len(metaTitle)).toBeLessThanOrEqual(28)
  for (const text of [description, lead]) {
    expect(len(text)).toBeGreaterThanOrEqual(75)
    expect(len(text)).toBeLessThanOrEqual(80)
    expect(lastStopWithin60(text)).toBeGreaterThanOrEqual(55)
  }
}

describe('guide table of contents', () => {
  it('follows the search copy rules', () => {
    checkSearchCopy(GUIDE_COPY.metaTitle, GUIDE_COPY.description, GUIDE_COPY.lead)
  })

  it('lists the chapters in order, with unique slugs', () => {
    expect(CHAPTERS.map((c) => c.order)).toEqual(CHAPTERS.map((_, i) => i + 1))
    expect(new Set(CHAPTERS.map((c) => c.slug)).size).toBe(CHAPTERS.length)
    for (const c of CHAPTERS) expect(c.slug).toMatch(/^[a-z0-9-]+$/)
  })
})

describe.each(CHAPTERS.map((c) => [c.slug, c] as const))('chapter %s', (_slug, chapter) => {
  it('follows the search copy rules', () => {
    checkSearchCopy(chapter.metaTitle, chapter.description, chapter.lead)
    expect(chapter.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('never mentions 登録 / ダウンロード / インストール', () => {
    const all = texts(chapter).join('\n')
    for (const word of BANNED) expect(all).not.toContain(word)
  })

  it('links only to pages that exist', () => {
    for (const text of texts(chapter)) {
      for (const link of links(text)) expect(ROUTES.has(link.href), link.href).toBe(true)
    }
  })

  it('has unique section anchors', () => {
    const ids = chapter.sections.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain('takeaway')
  })

  it('has well-formed figures', () => {
    for (const d of diagrams(chapter)) {
      for (const [sq, token] of Object.entries(d.pieces)) {
        expect(() => square(sq), sq).not.toThrow()
        expect(() => parseToken(token), token).not.toThrow()
      }
      for (const m of d.marks ?? []) expect(() => square(m.sq), m.sq).not.toThrow()
      for (const a of d.arrows ?? []) {
        expect(() => square(a.from)).not.toThrow()
        expect(() => square(a.to)).not.toThrow()
      }
      if (d.crop) {
        for (const n of [...d.crop.files, ...d.crop.ranks]) expect(n >= 1 && n <= 9).toBe(true)
      }
      expect(d.alt.length).toBeGreaterThan(0)
    }
  })
})

describe('chapters across the guide', () => {
  it('do not share titles, descriptions or endings', () => {
    const field = (k: 'metaTitle' | 'description' | 'lead') => CHAPTERS.map((c) => c[k])
    for (const k of ['metaTitle', 'description', 'lead'] as const) {
      expect(new Set(field(k)).size).toBe(CHAPTERS.length)
    }
    const tails = CHAPTERS.map((c) => [...c.description].slice(-8).join(''))
    expect(new Set(tails).size).toBe(CHAPTERS.length)
  })
})
