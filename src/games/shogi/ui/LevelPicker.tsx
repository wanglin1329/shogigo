// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef } from 'react'

import { levelOptions } from '../ai/levels'
import type { AiLevelId } from '../ai/types'
import { Modal } from '../../../site/Modal'

const ENGINE_NOTE: Record<string, string> = {
  js: '',
  yaneuraou: 'やねうら王',
}

export function LevelPicker({
  open,
  current,
  beaten,
  onPick,
  onClose,
}: {
  open: boolean
  current: AiLevelId
  beaten: readonly AiLevelId[]
  onPick: (level: AiLevelId) => void
  onClose: () => void
}) {
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
    el?.scrollIntoView({ block: 'center' })
    el?.focus()
  }, [open])

  return (
    <Modal open={open} title="強さを選ぶ" onClose={onClose} className="modal-narrow">
      <ul className="level-list" ref={listRef}>
        {levelOptions(new Set(beaten)).map((option) => {
          const { level } = option
          const locked = option.state === 'locked'
          return (
            <li key={level.id}>
              <button
                type="button"
                className="level-option"
                aria-pressed={level.id === current}
                disabled={locked}
                onClick={() => onPick(level.id)}
              >
                <span className="level-name">{level.label}</span>
                <span className="level-note">{locked ? option.hint : ENGINE_NOTE[level.engine]}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="modal-foot">途中で強さを変えると、新しい対局が始まります（直後なら元に戻せます）。</p>
    </Modal>
  )
}
