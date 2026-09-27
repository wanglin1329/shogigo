// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import type { Square } from '../core/hints'

const THRESHOLD = { mouse: 5, touch: 8, pen: 5 } as const
const SWALLOW_CLICK_MS = 350

export interface DragGhost<S> {
  source: S
  x: number
  y: number
}

interface Pending<S> {
  source: S
  pointerId: number
  startX: number
  startY: number
  threshold: number
  dragging: boolean
}

function squareUnder(x: number, y: number): Square | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-sq]')
  if (!el?.dataset.sq) return null
  const [sx, sy] = el.dataset.sq.split(',').map(Number)
  return { x: sx, y: sy }
}

/**
 * Tap and drag on the same pieces (docs/PLAN.md §5.3-7): pointerdown only
 * arms; the drag starts once the pointer travels past a small threshold.
 */
export function usePieceDrag<S>(handlers: {
  /** Called when a drag really starts; return false to refuse it. */
  onStart: (source: S) => boolean
  /** Pointer released over `target` (null = outside the board). */
  onDrop: (source: S, target: Square | null) => void
  onCancel: () => void
}) {
  const [ghost, setGhost] = useState<DragGhost<S> | null>(null)
  const pending = useRef<Pending<S> | null>(null)
  const frame = useRef(0)
  const latest = useRef(handlers)
  latest.current = handlers

  const stop = useCallback(() => {
    pending.current = null
    cancelAnimationFrame(frame.current)
    setGhost(null)
  }, [])

  useEffect(() => {
    function move(e: PointerEvent) {
      const p = pending.current
      if (!p || e.pointerId !== p.pointerId) return
      if (!p.dragging) {
        if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < p.threshold) return
        if (!latest.current.onStart(p.source)) {
          stop()
          return
        }
        p.dragging = true
      }
      const { clientX, clientY } = e
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => setGhost({ source: p.source, x: clientX, y: clientY }))
    }
    function up(e: PointerEvent) {
      const p = pending.current
      if (!p || e.pointerId !== p.pointerId) return
      if (p.dragging) {
        // The click that follows this pointerup must not act as a tap.
        const swallow = (ev: MouseEvent) => {
          ev.stopPropagation()
          ev.preventDefault()
        }
        // Touch browsers may deliver that click a little later than pointerup.
        window.addEventListener('click', swallow, { capture: true, once: true })
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), SWALLOW_CLICK_MS)
        latest.current.onDrop(p.source, squareUnder(e.clientX, e.clientY))
      }
      stop()
    }
    function cancel() {
      if (pending.current?.dragging) latest.current.onCancel()
      stop()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
    }
  }, [stop])

  const arm = useCallback((source: S, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    pending.current = {
      source,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      threshold: THRESHOLD[event.pointerType as keyof typeof THRESHOLD] ?? 5,
      dragging: false,
    }
  }, [])

  return { ghost, arm }
}
