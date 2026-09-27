import { createFileRoute } from '@tanstack/react-router'

import { robotsTxt } from '../site/sitemap'

// Prerendered to dist/client/robots.txt (vite.config.ts `pages`).
export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: () => new Response(robotsTxt(), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }),
    },
  },
})
