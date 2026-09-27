// SPDX-License-Identifier: GPL-3.0-only

// Secrets are not in wrangler.jsonc, so `wrangler types` cannot see them.
declare namespace Cloudflare {
  interface Env {
    /** HMAC key for room tokens and bot tickets. `wrangler secret put TOKEN_SECRET`; >= 16 chars. */
    TOKEN_SECRET: string
  }
}
