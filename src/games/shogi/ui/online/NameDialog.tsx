// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useState } from 'react'

import { Modal } from '../../../../site/Modal'
import { checkCustomName, randomNickname } from '../../online/identity'
import type { NameProfile } from '../../online/identity'

/** Choose how opponents see me: a generated 二つ名, or my own short name. */
export function NameDialog({
  open,
  profile,
  onSave,
  onClose,
}: {
  open: boolean
  profile: NameProfile
  onSave: (profile: NameProfile) => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<'generated' | 'custom'>('generated')
  const [generated, setGenerated] = useState('')
  const [custom, setCustom] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setMode(profile.mode === 'custom' ? 'custom' : 'generated')
    setGenerated(profile.mode === 'generated' ? profile.name : randomNickname())
    setCustom(profile.mode === 'custom' ? profile.name : '')
    setError(null)
  }, [open, profile])

  function save() {
    if (mode === 'generated') {
      onSave({ mode: 'generated', name: generated })
      return
    }
    const checked = checkCustomName(custom)
    if (!checked.ok) {
      setError(checked.message)
      return
    }
    onSave({ mode: 'custom', name: checked.name })
  }

  return (
    <Modal open={open} title="表示名" onClose={onClose} className="modal-narrow">
      <p className="setting-note">対局相手に表示される名前です。本名は入れないでください。</p>
      <div className="segmented" role="radiogroup" aria-label="名前の決め方">
        <label className="segment">
          <input type="radio" name="name-mode" checked={mode === 'generated'} onChange={() => setMode('generated')} />
          <span>二つ名をつける</span>
        </label>
        <label className="segment">
          <input type="radio" name="name-mode" checked={mode === 'custom'} onChange={() => setMode('custom')} />
          <span>自分で入力する</span>
        </label>
      </div>
      {mode === 'generated' ? (
        <div className="name-generated">
          <output className="name-preview">{generated}</output>
          <button type="button" className="chip" onClick={() => setGenerated(randomNickname())}>
            別の名前にする
          </button>
        </div>
      ) : (
        <label className="name-custom">
          <span className="setting-note">半角の英数字と _ - . だけ、10文字まで（空欄なら「匿名プレイヤー」）</span>
          <input
            type="text"
            autoComplete="nickname"
            maxLength={20}
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value)
              setError(null)
            }}
          />
        </label>
      )}
      {error && (
        <p className="setting-warn" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="btn btn-primary result-next" onClick={save}>
        この名前にする
      </button>
    </Modal>
  )
}
