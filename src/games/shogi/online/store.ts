// SPDX-License-Identifier: GPL-3.0-only

// The online controllers are plain classes (testable without React or a DOM);
// hooks read them through useSyncExternalStore. Snapshots are immutable:
// every change produces a new object.

export class Store<T> {
  private listeners = new Set<() => void>()

  constructor(private state: T) {}

  get = (): T => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Merge fields into the current snapshot. */
  protected set(patch: Partial<T>): void {
    this.replace({ ...this.state, ...patch })
  }

  /** Swap in a whole new snapshot (phase changes of a union state). */
  protected replace(next: T): void {
    this.state = next
    for (const listener of this.listeners) listener()
  }
}

/** Timers and time, injectable for tests. */
export interface Clock {
  now(): number
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
  setInterval(fn: () => void, ms: number): unknown
  clearInterval(handle: unknown): void
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
}

/** The part of WebSocket the controllers use. */
export interface SocketLike {
  readonly readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: { code?: number }) => void) | null
  onerror: ((event: unknown) => void) | null
}

export const SOCKET_OPEN = 1
export const SOCKET_CONNECTING = 0

/** Page visibility, injectable for tests (mobile browsers drop sockets when hidden). */
export interface Visibility {
  isVisible(): boolean
  onChange(listener: () => void): () => void
}

export const documentVisibility: Visibility = {
  isVisible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  onChange: (listener) => {
    if (typeof document === 'undefined') return () => {}
    document.addEventListener('visibilitychange', listener)
    return () => document.removeEventListener('visibilitychange', listener)
  },
}

/** ws(s)://<this host><path> — same origin as the page. */
export function sameOriginWsUrl(path: string): string {
  const { protocol, host } = globalThis.location
  return `${protocol === 'https:' ? 'wss' : 'ws'}://${host}${path}`
}

export function browserSocket(url: string): SocketLike {
  return new WebSocket(url) as unknown as SocketLike
}
