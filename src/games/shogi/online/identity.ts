// SPDX-License-Identifier: GPL-3.0-only

// Who the player is online: an anonymous uid (the only credential — no
// accounts) and a display name. Everything is read lazily (SSR-safe).

import { isGeneratedName, randomName } from '../../../online/nickname/words'
import { normalizeCustomName, validCustomName } from '../../../online/nickname/profile'
import { readJson, writeJson } from '../../../site/storage'

export const UID_PATTERN = /^[0-9a-zA-Z-]{8,64}$/
const UID_KEY = 'online.uid'
/** Set by the server (GET /api/online-stats?uid=…): survives Safari clearing script storage. */
export const UID_COOKIE = '__Host-sg_uid'
const NAME_KEY = 'online.name'

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  for (const part of document.cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) {
      try {
        return decodeURIComponent(rest.join('='))
      } catch {
        return null
      }
    }
  }
  return null
}

function newUid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * The player's uid: from storage, else from the server-set cookie (storage
 * was cleared), else a new one. Always saved back to storage.
 */
export function getOnlineUid(): string {
  const stored = readJson<string>(UID_KEY)
  if (typeof stored === 'string' && UID_PATTERN.test(stored)) return stored
  const cookie = readCookie(UID_COOKIE)
  const uid = cookie && UID_PATTERN.test(cookie) ? cookie : newUid()
  writeJson(UID_KEY, uid)
  return uid
}

// ---------------------------------------------------------------- names

/**
 * - default: a neutral `PlayerNNNN`, assigned once
 * - generated: a 二つ名 「〇〇の〇〇」 from the shared vocabulary
 * - custom: half-width letters/digits/_-. up to 10, or empty (= anonymous)
 */
export type NameMode = 'default' | 'generated' | 'custom'

export interface NameProfile {
  mode: NameMode
  name: string
}

function neutralName(): string {
  return `Player${1000 + Math.floor(Math.random() * 9000)}`
}

/** The saved name, repaired if the vocabulary or rules changed since it was saved. */
export function loadNameProfile(): NameProfile {
  const saved = readJson<Partial<NameProfile>>(NAME_KEY)
  const name = typeof saved?.name === 'string' ? saved.name : ''
  let profile: NameProfile
  if (saved?.mode === 'generated') {
    profile = { mode: 'generated', name: isGeneratedName(name) ? name : randomName() }
  } else if (saved?.mode === 'custom') {
    profile = { mode: 'custom', name: validCustomName(name) ? name : '' }
  } else {
    profile = { mode: 'default', name: /^Player\d{4}$/.test(name) ? name : neutralName() }
  }
  if (!saved || saved.mode !== profile.mode || saved.name !== profile.name) writeJson(NAME_KEY, profile)
  return profile
}

export function saveNameProfile(profile: NameProfile): void {
  writeJson(NAME_KEY, profile)
}

/** A fresh 二つ名 (no network). */
export function randomNickname(): string {
  return randomName()
}

export type CustomNameCheck = { ok: true; name: string } | { ok: false; message: string }

/** Validate what the player typed for a custom name (full-width letters are folded first). */
export function checkCustomName(raw: string): CustomNameCheck {
  const name = normalizeCustomName(raw).trim()
  if (validCustomName(name)) return { ok: true, name }
  if (/[^A-Za-z0-9_\-.]/.test(name)) {
    return { ok: false, message: '使えるのは半角の英字・数字と _ - . だけです。' }
  }
  return { ok: false, message: '10文字までで入力してください。' }
}

/** What is sent to the server as the display name (null = anonymous). */
export function wireName(profile: NameProfile): string | null {
  return profile.name ? profile.name : null
}

// ---------------------------------------------------------------- showing names

export const ANONYMOUS = '匿名プレイヤー'
export const COM_NAME = 'COM'

/** A name as shown to others; empty → 匿名プレイヤー. */
export function shownName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim()
  return trimmed ? trimmed.slice(0, 10) : ANONYMOUS
}

/**
 * Name with the honorific: ASCII names get a half-width space before さん
 * (「Bob さん」), Japanese names none (「ふわふわのたぬきさん」), COM none.
 */
export function withHonorific(name: string | null | undefined): string {
  const shown = shownName(name)
  if (shown === COM_NAME) return shown
  return /^[\x20-\x7e]+$/.test(shown) ? `${shown} さん` : `${shown}さん`
}
