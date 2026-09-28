// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useState } from 'react'

import { THEME_STORAGE_KEY, applyTheme, onSystemThemeChange, readThemePref, resolveTheme, writeThemePref } from './theme'
import type { ThemePref } from './theme'

/**
 * 表示テーマ in the footer. Renders 「自動」 on the server and on the first
 * client render (no hydration mismatch); the saved choice is read after
 * mounting. The page itself was already themed by THEME_SCRIPT.
 */
export function ThemeSelect() {
  const [pref, setPref] = useState<ThemePref>('auto')

  useEffect(() => setPref(readThemePref()), [])

  // A choice made in another tab applies here too.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== THEME_STORAGE_KEY) return
      const next = readThemePref()
      setPref(next)
      applyTheme(resolveTheme(next))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // 「自動」 follows the system while the page is open.
  useEffect(() => {
    if (pref !== 'auto') return
    return onSystemThemeChange(() => applyTheme(resolveTheme('auto')))
  }, [pref])

  return (
    <label className="theme-select">
      <span>表示テーマ</span>
      <select
        value={pref}
        onChange={(e) => {
          const next = e.target.value as ThemePref
          setPref(next)
          writeThemePref(next)
          applyTheme(resolveTheme(next))
        }}
      >
        <option value="auto">自動（端末の設定）</option>
        <option value="light">ライト</option>
        <option value="dark">ダーク</option>
      </select>
    </label>
  )
}
