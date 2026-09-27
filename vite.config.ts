import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

import ssrRoutes from './src/site/ssr-routes.json' with { type: 'json' }

const isSsrOnly = (path: string) =>
  ssrRoutes.paths.some((p) => path === p || path.startsWith(`${p}/`))

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
        // Link crawling is on by default, so SSR-only pages linked from a
        // prerendered page would get frozen at build time without this filter.
        filter: (page) => !isSsrOnly(page.path),
        // `/board` → board.html (no trailing slash), matching wrangler's
        // assets.html_handling = "auto-trailing-slash".
        autoSubfolderIndex: false,
        failOnError: true,
      },
    }),
    viteReact(),
  ],
})
