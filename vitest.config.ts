import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        // Pure logic (rules engine, kifu, …): plain Node, fast.
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
              bindings: { TOKEN_SECRET: 'test-secret-for-vitest-only' },
            },
          }),
        ],
        test: { name: 'worker', include: ['test/worker/**/*.spec.ts'] },
      },
    ],
  },
})
