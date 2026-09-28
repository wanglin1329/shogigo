// SPDX-License-Identifier: GPL-3.0-only

import type { Diagram } from './diagram'

/** Paragraph text. `[文字](/path)` becomes a link; only site paths are allowed (checked by tests). */
export type Rich = string

export type Block =
  | { kind: 'p'; text: Rich }
  | { kind: 'figures'; diagrams: readonly Diagram[] }
  | { kind: 'list'; items: readonly Rich[] }
  | { kind: 'table'; caption?: string; head: readonly string[]; rows: readonly (readonly Rich[])[] }
  | { kind: 'note'; title: string; text: Rich }

export interface GuideSection {
  /** Anchor (#id) of the section. */
  id: string
  heading: string
  blocks: readonly Block[]
}

export interface Chapter {
  slug: string
  order: number
  /** H1. */
  title: string
  /** Short name for cards and previous / next links. */
  navTitle: string
  /** ≤ 28 characters. */
  metaTitle: string
  /** 75–80 characters, a 。 at position 55–60. */
  description: string
  /** First paragraph: 75–80 characters, a 。 at position 55–60. */
  lead: string
  /** One sentence for the table of contents. */
  summary: string
  /** Last change of this chapter's text (sitemap <lastmod>). Update it with the text. */
  updatedAt: string
  /** Small figure on the table of contents. */
  hero: Diagram
  sections: readonly GuideSection[]
  takeaway: readonly string[]
}

// Authoring helpers.
export const p = (text: Rich): Block => ({ kind: 'p', text })
export const figs = (...diagrams: Diagram[]): Block => ({ kind: 'figures', diagrams })
export const list = (...items: Rich[]): Block => ({ kind: 'list', items })
export const note = (title: string, text: Rich): Block => ({ kind: 'note', title, text })
export const table = (head: string[], rows: Rich[][], caption?: string): Block => ({ kind: 'table', head, rows, caption })
