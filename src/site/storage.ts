// SPDX-License-Identifier: GPL-3.0-only

// localStorage that never throws (private mode, blocked storage, SSR).
// Keys get one site-wide prefix so a future rename is a single change.

const PREFIX = 'sg.'

export function readJson<T>(key: string): T | null {
  try {
    const raw = globalThis.localStorage?.getItem(PREFIX + key)
    return raw == null ? null : (JSON.parse(raw) as T)
  } catch {
    return null
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Quota or disabled storage: the game keeps working without persistence.
  }
}

export function removeKey(key: string): void {
  try {
    globalThis.localStorage?.removeItem(PREFIX + key)
  } catch {
    // ignore
  }
}
