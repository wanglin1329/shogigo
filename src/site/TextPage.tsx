// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from 'react'

import { LASTMOD, japaneseDate } from '../content/lastmod'
import type { SitePath } from '../content/lastmod'

/** Layout for the legal / information pages. */
export function TextPage({ path, title, children }: { path: SitePath; title: string; children: ReactNode }) {
  return (
    <main className="site-page">
      <h1>{title}</h1>
      {children}
      <p className="updated">最終更新日：{japaneseDate(LASTMOD[path])}</p>
    </main>
  )
}
