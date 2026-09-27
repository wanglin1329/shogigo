import path from 'node:path'

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, 'migrations'))
  return {
    test: {
      projects: [
        {
          // Pure logic (rules engine, kifu, rating, …): plain Node, fast.
          test: { name: 'core', include: ['test/core/**/*.spec.ts'], environment: 'node' },
        },
        {
          // API routes and Durable Objects inside workerd. The entry is
          // test/worker-entry.ts: src/server.ts also pulls in TanStack Start's
          // virtual server entry, which only resolves inside the app's Vite build.
          // The API router and DO classes under test are the same modules.
          plugins: [
            cloudflareTest({
              main: './test/worker-entry.ts',
              wrangler: { configPath: './wrangler.jsonc' },
              miniflare: {
                bindings: {
                  // Tests must not depend on the real secret (>= 16 chars to pass the guard).
                  TOKEN_SECRET: 'test-secret-for-vitest-only',
                  TEST_MIGRATIONS: migrations,
                },
              },
            }),
          ],
          test: {
            name: 'worker',
            include: ['test/worker/**/*.spec.ts'],
            setupFiles: ['./test/worker/apply-migrations.ts'],
            // All worker test files share one workerd (and its D1 / DO storage).
            // Run them one at a time so one file's reset() cannot wipe another's data.
            fileParallelism: false,
          },
        },
      ],
    },
  }
})
