// SPDX-License-Identifier: GPL-3.0-only

/** Public build-time config from env/.env (docs/PLAN.md §9.5-1). */
interface ImportMetaEnv {
  readonly VITE_SITE_URL?: string
  readonly VITE_CONTACT_EMAIL?: string
  readonly VITE_SOURCE_URL?: string
  readonly VITE_PLAUSIBLE_SRC?: string
}

// Secrets are not in wrangler.jsonc, so `wrangler types` cannot see them.
declare namespace Cloudflare {
  interface Env {
    /** HMAC key for room tokens and bot tickets. `wrangler secret put TOKEN_SECRET`; >= 16 chars. */
    TOKEN_SECRET: string
  }
}
