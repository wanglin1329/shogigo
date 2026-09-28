// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from 'react'

/** Same breakpoint as the two-column game layout (src/styles/desktop.css). */
export const WIDE_QUERY = '(min-width: 1024px) and (min-height: 720px)'

export function isWideScreen(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(WIDE_QUERY).matches
}

/**
 * The kifu panel starts open on wide screens, where it has its own column.
 * Applied after hydration: the prerendered HTML is the closed (phone) layout.
 */
export function useOpenOnWideScreen(open: (value: boolean) => void) {
  useEffect(() => {
    if (isWideScreen()) open(true)
  }, [open])
}
