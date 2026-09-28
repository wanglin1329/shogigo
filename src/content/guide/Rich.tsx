// SPDX-License-Identifier: GPL-3.0-only

import { Fragment } from 'react'

const LINK = /\[([^\]]+)\]\((\/[^)\s]*)\)/g

/** Site-internal links written as [文字](/path) in the guide text. */
export function links(text: string): { label: string; href: string }[] {
  return [...text.matchAll(LINK)].map((m) => ({ label: m[1], href: m[2] }))
}

export function Rich({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(LINK)) {
    parts.push(text.slice(last, m.index))
    parts.push(
      <a key={m.index} href={m[2]}>
        {m[1]}
      </a>,
    )
    last = (m.index ?? 0) + m[0].length
  }
  parts.push(text.slice(last))
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>{part}</Fragment>
      ))}
    </>
  )
}
