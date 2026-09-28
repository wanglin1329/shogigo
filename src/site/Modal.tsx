// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

import { IconClose } from './icons'

/**
 * Native <dialog> opened with showModal(): the browser provides the focus
 * trap, Esc handling, the inert background and focus return on close.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  className = '',
  hideTitle = false,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
  hideTitle?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal-body">
        <header className="modal-head">
          <h2 className={hideTitle ? 'sr-only' : 'modal-title'}>{title}</h2>
          <button type="button" className="icon-button" aria-label="閉じる" onClick={onClose}>
            <IconClose />
          </button>
        </header>
        {open && children}
      </div>
    </dialog>
  )
}
