// SPDX-License-Identifier: GPL-3.0-only

/** Opens a share target in a new tab (an anchor click is blocked less often than window.open). */
export function openExternal(href: string): void {
  const a = document.createElement('a')
  a.href = href
  a.target = '_blank'
  a.rel = 'noopener'
  a.click()
}

export const xShareUrl = (text: string) => `https://x.com/intent/post?text=${encodeURIComponent(text)}`
export const lineShareUrl = (text: string) => `https://line.me/R/share?text=${encodeURIComponent(text)}`
