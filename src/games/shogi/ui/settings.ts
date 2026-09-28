// SPDX-License-Identifier: GPL-3.0-only

import { isWazaFxLevel } from '../core/waza/effect'
import type { WazaFxLevel } from '../core/waza/effect'
import { readJson, writeJson } from '../../../site/storage'

export type PieceStyle = 'text' | 'guide'
export type Byoyomi = 'full' | 'soft' | 'off'

export interface ShogiSettings {
  /** Side the human plays against the AI. */
  aiPlayerSide: 'sente' | 'gote'
  /** 'guide' draws the movement dots on every piece (beginners). */
  pieceStyle: PieceStyle
  /** Red frames/lines for checks and the "why can't I move" bubble. */
  moveHints: boolean
  sound: boolean
  /** Short vibration on each move (mobile). */
  haptics: boolean
  /** Flip the board manually (AI mode flips automatically when playing 後手). */
  flipped: boolean
  /** Random match: play COM when nobody is found in time. */
  botFallback: boolean
  /** Hide 段級位/実力値 (mine to others, and theirs to me). */
  hideRank: boolean
  /** Spoken countdown on my own clock in timed online games. */
  byoyomi: Byoyomi
  /** 手筋・囲いの演出: 派手 / 標準 / 控えめ / なし. */
  wazaFx: WazaFxLevel
}

export const DEFAULT_SETTINGS: ShogiSettings = {
  aiPlayerSide: 'sente',
  pieceStyle: 'text',
  moveHints: true,
  sound: true,
  haptics: true,
  flipped: false,
  botFallback: true,
  hideRank: false,
  byoyomi: 'soft',
  wazaFx: 'std',
}

const KEY = 'shogi.settings'

export function loadSettings(): ShogiSettings {
  const saved = readJson<Partial<ShogiSettings>>(KEY)
  if (!saved || typeof saved !== 'object') return DEFAULT_SETTINGS
  const merged: ShogiSettings = { ...DEFAULT_SETTINGS }
  // Only accept values of the right type: stored data may come from an older version.
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof ShogiSettings)[]) {
    if (typeof saved[key] === typeof DEFAULT_SETTINGS[key]) (merged as unknown as Record<string, unknown>)[key] = saved[key]
  }
  if (merged.aiPlayerSide !== 'sente' && merged.aiPlayerSide !== 'gote') merged.aiPlayerSide = 'sente'
  if (merged.pieceStyle !== 'text' && merged.pieceStyle !== 'guide') merged.pieceStyle = 'text'
  if (!['full', 'soft', 'off'].includes(merged.byoyomi)) merged.byoyomi = 'soft'
  if (!isWazaFxLevel(merged.wazaFx)) merged.wazaFx = 'std'
  return merged
}

export function saveSettings(settings: ShogiSettings): void {
  writeJson(KEY, settings)
}
