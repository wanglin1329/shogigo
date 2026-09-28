// SPDX-License-Identifier: GPL-3.0-only

// Light / dark theme (docs/PLAN.md §9.10). The page always carries a concrete
// <html data-theme="light|dark">: set before the first paint by THEME_SCRIPT,
// and kept in sync by <ThemeSelect> (footer). 「自動」 follows the system.

import { readJson, removeKey, writeJson } from './storage'

export type Theme = 'light' | 'dark'
export type ThemePref = Theme | 'auto'

const KEY = 'theme'
/** The full localStorage key (src/site/storage.ts adds the 'sg.' prefix). */
export const THEME_STORAGE_KEY = `sg.${KEY}`
const DARK_QUERY = '(prefers-color-scheme: dark)'

/** Browser UI colour (theme-color) per theme: the page background. */
export const THEME_COLOR: Record<Theme, string> = { light: '#f4efe4', dark: '#1b1713' }

/**
 * Runs in <head> before the first paint (ScriptOnce). Same rules as
 * readThemePref()/resolveTheme(): storage key sg.theme, a JSON string.
 */
export const THEME_SCRIPT = `(function(){try{var p=null;try{p=JSON.parse(localStorage.getItem('sg.${KEY}'))}catch(e){}
var t=p==='light'||p==='dark'?p:(window.matchMedia&&window.matchMedia('${DARK_QUERY}').matches?'dark':'light');
document.documentElement.setAttribute('data-theme',t);
var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='dark'?'${THEME_COLOR.dark}':'${THEME_COLOR.light}')}catch(e){}})()`

export function readThemePref(): ThemePref {
  const saved = readJson<string>(KEY)
  return saved === 'light' || saved === 'dark' ? saved : 'auto'
}

export function writeThemePref(pref: ThemePref) {
  if (pref === 'auto') removeKey(KEY)
  else writeJson(KEY, pref)
}

export function systemTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light'
}

export function resolveTheme(pref: ThemePref): Theme {
  return pref === 'auto' ? systemTheme() : pref
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
}

/** Calls back when the system theme changes (for 「自動」). Returns the unsubscribe. */
export function onSystemThemeChange(callback: () => void): () => void {
  const media = window.matchMedia?.(DARK_QUERY)
  if (!media) return () => {}
  media.addEventListener('change', callback)
  return () => media.removeEventListener('change', callback)
}
