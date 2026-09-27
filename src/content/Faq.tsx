// SPDX-License-Identifier: GPL-3.0-only

import type { FaqItem } from './types'

export function Faq({ items }: { items: readonly FaqItem[] }) {
  return (
    <dl className="faq">
      {items.map((item) => (
        <div key={item.q}>
          <dt>{item.q}</dt>
          <dd>{item.a}</dd>
        </div>
      ))}
    </dl>
  )
}
