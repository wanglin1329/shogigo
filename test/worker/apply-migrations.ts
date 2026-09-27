// SPDX-License-Identifier: GPL-3.0-only

// Worker test setup. @cloudflare/vitest-plugin does not isolate storage per
// test by itself: every test starts from empty D1 + Durable Object storage
// (reset() after each test) with the D1 tables re-created before it.
import { applyD1Migrations, reset } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterEach, beforeEach } from 'vitest'

const { TEST_MIGRATIONS } = env as unknown as { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] }

beforeEach(async () => {
  await applyD1Migrations(env.DB, TEST_MIGRATIONS)
})

afterEach(async () => {
  await reset()
})
