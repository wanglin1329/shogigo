// SPDX-License-Identifier: GPL-3.0-only

// Daily content (tsume) switches at JST midnight regardless of the viewer's
// or the edge's time zone.

const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** JST calendar date as YYYY-MM-DD. */
export function jstDate(nowMs: number): string {
  return new Date(nowMs + JST_OFFSET_MS).toISOString().slice(0, 10)
}

/** Whole seconds until the next JST midnight (at least 1). */
export function secondsUntilJstMidnight(nowMs: number): number {
  const msIntoJstDay = (nowMs + JST_OFFSET_MS) % DAY_MS
  return Math.max(1, Math.ceil((DAY_MS - msIntoJstDay) / 1000))
}
