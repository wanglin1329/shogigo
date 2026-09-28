// SPDX-License-Identifier: GPL-3.0-only

// The site's icon set: one 24px grid, one stroke weight (1.75), currentColor.
// Drawn for this site (no icon library). Decorative: the button carries the label.

import type { ReactNode } from 'react'

function Icon({ size = 20, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export function IconSettings(props: { size?: number }) {
  return (
    <Icon {...props}>
      <path d="M18.94 10.08 L21.06 10.42 L21.06 13.58 L18.94 13.92 L18.26 15.55 L19.53 17.29 L17.29 19.53 L15.55 18.26 L13.92 18.94 L13.58 21.06 L10.42 21.06 L10.08 18.94 L8.45 18.26 L6.71 19.53 L4.47 17.29 L5.74 15.55 L5.06 13.92 L2.94 13.58 L2.94 10.42 L5.06 10.08 L5.74 8.45 L4.47 6.71 L6.71 4.47 L8.45 5.74 L10.08 5.06 L10.42 2.94 L13.58 2.94 L13.92 5.06 L15.55 5.74 L17.29 4.47 L19.53 6.71 L18.26 8.45 Z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  )
}

/** Turn the board around: one arrow up, one down. */
export function IconFlip(props: { size?: number }) {
  return (
    <Icon {...props}>
      <path d="M8 20V4M4.5 7.5 8 4l3.5 3.5M16 4v16M12.5 16.5 16 20l3.5-3.5" />
    </Icon>
  )
}

export function IconClose(props: { size?: number }) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  )
}

export function IconChevronLeft(props: { size?: number }) {
  return (
    <Icon {...props}>
      <path d="M15 5l-7 7 7 7" />
    </Icon>
  )
}

export function IconChevronRight(props: { size?: number }) {
  return (
    <Icon {...props}>
      <path d="M9 5l7 7-7 7" />
    </Icon>
  )
}
