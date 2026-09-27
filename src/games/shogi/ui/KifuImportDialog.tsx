// SPDX-License-Identifier: GPL-3.0-only

import { useMemo, useState } from 'react'

import { describeParsed, parseKifuText } from '../core/kifu/kif'
import type { GameRecord } from '../core/record'
import { Modal } from '../../../site/Modal'

/** KIF files from older software are usually Shift_JIS; try UTF-8 first. */
async function readKifuFile(file: File): Promise<string> {
  const bytes = await file.arrayBuffer()
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  if (!utf8.includes('�')) return utf8
  try {
    return new TextDecoder('shift_jis').decode(bytes)
  } catch {
    return utf8
  }
}

/**
 * Paste (or pick) a KIF / USI record and open it (docs/PLAN.md §5.3-12).
 * The text is checked as it is typed, with the reason when it cannot be read.
 */
export function KifuImportDialog({
  open,
  onClose,
  onOpen,
}: {
  open: boolean
  onClose: () => void
  onOpen: (record: GameRecord) => void
}) {
  const [text, setText] = useState('')
  const parsed = useMemo(() => (text.trim() ? parseKifuText(text) : null), [text])

  return (
    <Modal open={open} title="棋譜を読み込む" onClose={onClose} className="modal-narrow">
      <label className="import-field">
        <span className="setting-note">KIF形式、またはUSI形式（position startpos moves 7g7f …）の棋譜を貼り付けてください。</span>
        <textarea
          rows={7}
          value={text}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          placeholder={'手合割：平手\n手数----指手---------消費時間--\n   1 ７六歩(77)\n   2 ３四歩(33)'}
        />
      </label>
      <label className="chip import-file">
        ファイルから読み込む（.kif）
        <input
          type="file"
          accept=".kif,.kifu,.txt,text/plain"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (file) setText(await readKifuFile(file))
            e.target.value = ''
          }}
        />
      </label>
      {parsed && (
        <p className={parsed.ok ? 'import-ok' : 'setting-warn'} role="status" aria-live="polite">
          {describeParsed(parsed)}
        </p>
      )}
      <button
        type="button"
        className="btn btn-primary result-next"
        disabled={!parsed?.ok}
        onClick={() => {
          if (!parsed?.ok) return
          onOpen({ initialSfen: parsed.initialSfen, moves: parsed.moves })
          setText('')
        }}
      >
        この棋譜を開く
      </button>
    </Modal>
  )
}
