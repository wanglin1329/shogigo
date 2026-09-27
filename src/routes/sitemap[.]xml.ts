import { createFileRoute } from '@tanstack/react-router'

import { sitemapXml } from '../site/sitemap'

// Prerendered to dist/client/sitemap.xml (vite.config.ts `pages`).
export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: () => new Response(sitemapXml(), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } }),
    },
  },
})
