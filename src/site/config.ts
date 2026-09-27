// SPDX-License-Identifier: GPL-3.0-only

// Public build-time configuration (env/.env, docs/PLAN.md §9.5-1). The values
// are baked into the prerendered pages and the bundles at build time.

const env = import.meta.env

function required(name: string, value: string | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed) throw new Error(`${name} is not set (env/.env)`)
  return trimmed
}

/** Canonical origin, without a trailing slash (https://shogigo.com). */
export const SITE_URL = required('VITE_SITE_URL', env.VITE_SITE_URL).replace(/\/+$/, '')

/** お問い合わせ address; empty = no contact page. */
export const CONTACT_EMAIL = env.VITE_CONTACT_EMAIL?.trim() ?? ''

/** Source code repository (GPL: every page links to it). */
export const SOURCE_URL = required('VITE_SOURCE_URL', env.VITE_SOURCE_URL)

/** Plausible script URL (absolute https, its host is published in /privacy); empty = no analytics. */
export const PLAUSIBLE_SRC = httpsUrlOrEmpty('VITE_PLAUSIBLE_SRC', env.VITE_PLAUSIBLE_SRC)

function httpsUrlOrEmpty(name: string, value: string | undefined): string {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return ''
  if (!URL.canParse(trimmed) || new URL(trimmed).protocol !== 'https:') {
    throw new Error(`${name} must be an absolute https URL (env/.env)`)
  }
  return trimmed
}

/** Absolute URL for a site path ('/' or '/board'; never a trailing slash). */
export function absoluteUrl(path: string): string {
  return path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`
}
