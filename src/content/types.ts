// SPDX-License-Identifier: GPL-3.0-only

export interface FaqItem {
  q: string
  a: string
}

/** Search-facing text of a game page (docs/PLAN.md §9.5-3; checked by test/core/copy.spec.ts). */
export interface PageCopy {
  /** ≤ 28 chars, 「名｜説明」, no brand. */
  title: string
  /** 75–80 chars, a 。 at position 55–60. */
  description: string
  /** Visually hidden: the board comes first on screen. */
  h1: string
  /** First paragraph of the guide: 75–80 chars, 「〇〇は、〜です」. */
  lead: string
  faq: readonly FaqItem[]
}
