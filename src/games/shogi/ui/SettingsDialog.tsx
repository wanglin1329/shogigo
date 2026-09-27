// SPDX-License-Identifier: GPL-3.0-only

import { useState } from 'react'

import type { AiDiagnostics, AiLevelId } from '../ai/types'
import type { Player } from '../core/engine'
import { toSfen } from '../core/kifu/sfen'
import { currentState } from '../core/record'
import type { GameView } from '../core/record'
import { Modal } from '../../../site/Modal'
import type { ShogiSettings } from './settings'

/** Recent uncaught errors, attached to the diagnostics text. */
const recentErrors: string[] = []
if (typeof window !== 'undefined') {
  const remember = (message: string) => {
    recentErrors.push(`${new Date().toISOString()} ${message}`.slice(0, 300))
    if (recentErrors.length > 5) recentErrors.shift()
  }
  window.addEventListener('error', (e) => remember(e.message))
  window.addEventListener('unhandledrejection', (e) => remember(String(e.reason)))
}

function diagnosticsText(view: GameView, level: AiLevelId, ai: AiDiagnostics | null): string {
  const state = currentState(view)
  return [
    `url: ${location.href}`,
    `ua: ${navigator.userAgent}`,
    `viewport: ${innerWidth}x${innerHeight} @${devicePixelRatio}`,
    `level: ${level}`,
    `ai: ${ai ? `${ai.yaneuraouState} ${ai.wasmVariant ?? '-'} ${ai.lastError ?? ''}` : '-'}`,
    `position: ${toSfen(state)}`,
    `start: ${view.record.initialSfen ?? 'startpos'}`,
    `moves(${view.record.moves.length}, at ${view.cursor}): ${view.record.moves.slice(-40).join(' ')}`,
    `errors: ${recentErrors.join(' | ') || '-'}`,
  ].join('\n')
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="setting-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

export function SettingsDialog({
  open,
  settings,
  pendingSide,
  movesPlayed,
  onChange,
  onSideChange,
  onClose,
  diagnostics,
  view,
  level,
}: {
  open: boolean
  settings: ShogiSettings
  /** Side chosen in this dialog, applied when it closes. */
  pendingSide: Player | null
  movesPlayed: number
  onChange: (next: ShogiSettings) => void
  onSideChange: (side: Player) => void
  onClose: () => void
  diagnostics: () => AiDiagnostics | null
  view: GameView
  level: AiLevelId
}) {
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null)
  const side = pendingSide ?? settings.aiPlayerSide
  const set = <K extends keyof ShogiSettings>(key: K, value: ShogiSettings[K]) => onChange({ ...settings, [key]: value })

  return (
    <Modal open={open} title="設定" onClose={onClose} className="modal-narrow">
      <fieldset className="setting-group">
        <legend>AI対戦での手番</legend>
        <div className="segmented" role="radiogroup">
          {(['sente', 'gote'] as const).map((s) => (
            <label key={s} className="segment">
              <input type="radio" name="side" checked={side === s} onChange={() => onSideChange(s)} />
              <span>{s === 'sente' ? '先手（先に指す）' : '後手'}</span>
            </label>
          ))}
        </div>
        {pendingSide && pendingSide !== settings.aiPlayerSide && movesPlayed > 0 && (
          <p className="setting-warn">
            手番を変えると、いまの対局（{movesPlayed}手目）は終わって新しい対局になります。この画面を閉じたときに切り替わります。
          </p>
        )}
      </fieldset>

      <fieldset className="setting-group">
        <legend>駒の表示</legend>
        <div className="segmented" role="radiogroup">
          <label className="segment">
            <input type="radio" name="piece" checked={settings.pieceStyle === 'text'} onChange={() => set('pieceStyle', 'text')} />
            <span>文字だけ</span>
          </label>
          <label className="segment">
            <input type="radio" name="piece" checked={settings.pieceStyle === 'guide'} onChange={() => set('pieceStyle', 'guide')} />
            <span>動ける方向も表示（はじめての方に）</span>
          </label>
        </div>
      </fieldset>

      <fieldset className="setting-group">
        <legend>表示と操作</legend>
        <Toggle label="王手や、指せない理由を盤上で知らせる" checked={settings.moveHints} onChange={(v) => set('moveHints', v)} />
        <Toggle label="駒音を鳴らす" checked={settings.sound} onChange={(v) => set('sound', v)} />
        <Toggle label="相手が指したときに振動する（スマホ）" checked={settings.haptics} onChange={(v) => set('haptics', v)} />
      </fieldset>

      <fieldset className="setting-group">
        <legend>不具合のご報告</legend>
        <p className="setting-note">うまく動かないときは、この情報をお問い合わせに貼り付けてください。個人を特定する情報は含まれません。</p>
        <button
          type="button"
          className="chip"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(diagnosticsText(view, level, diagnostics()))
              setCopied('ok')
            } catch {
              setCopied('failed')
            }
          }}
        >
          {copied === 'ok' ? 'コピーしました' : copied === 'failed' ? 'コピーできませんでした' : '診断情報をコピー'}
        </button>
      </fieldset>
    </Modal>
  )
}
