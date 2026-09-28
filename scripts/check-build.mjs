// SPDX-License-Identifier: GPL-3.0-only

// Post-build assertions (run by `pnpm build`). Each one guards a mistake that
// builds fine but breaks production silently (docs/PLAN.md §2.1, §6.5-5).

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseEnv } from 'node:util'

const ssrRoutes = JSON.parse(readFileSync('src/site/ssr-routes.json', 'utf8')).paths
const clientDir = 'dist/client'
const failures = []

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

if (!existsSync(clientDir)) {
  console.error(`check-build: ${clientDir} not found — did vite build run?`)
  process.exit(1)
}
const files = walk(clientDir).map((f) => `/${relative(clientDir, f)}`)

// 1. SSR-only routes must not exist as static HTML: a static file is served
//    before the Worker runs, freezing e.g. the daily tsume at build time.
for (const route of ssrRoutes) {
  const frozen = files.filter(
    (f) => f.endsWith('.html') && (f === `${route}.html` || f.startsWith(`${route}/`)),
  )
  if (frozen.length) failures.push(`SSR route ${route} was prerendered: ${frozen.join(', ')}`)
}

// 2. Pages and generated files that must be prerendered. /contact exists
//    exactly when a contact address is configured (env/.env).
// Node's parser is the one Vite uses for env files.
const publicEnv = parseEnv(readFileSync('env/.env', 'utf8'))
const contactEmail = publicEnv.VITE_CONTACT_EMAIL?.trim() ?? ''
for (const page of [
  '/index.html',
  '/board.html',
  '/online.html',
  '/records.html',
  '/about.html',
  '/privacy.html',
  '/terms.html',
  '/license.html',
  '/sitemap.xml',
  '/robots.txt',
  '/guide.html',
  // Rules guide chapters: prerendered through the links on /guide.
  ...[...readFileSync('src/content/guide/chapters/index.ts', 'utf8').matchAll(/from '\.\/\d\d-([a-z0-9-]+)'/g)].map(
    (m) => `/guide/${m[1]}.html`,
  ),
]) {
  if (!files.includes(page)) failures.push(`expected prerendered page ${page}`)
}
if (files.includes('/contact.html') !== (contactEmail !== '')) {
  failures.push(`/contact.html must exist exactly when VITE_CONTACT_EMAIL is set (set: ${contactEmail !== ''})`)
}

// 3. Static asset headers and GPL engine files must ship.
for (const required of [
  '/_headers',
  '/games/shogi/engine/ai-worker.js',
  '/games/shogi/engine/yaneuraou-v7.63/sse42/yaneuraou.wasm',
  '/games/shogi/engine/yaneuraou-v7.63/nosimd/yaneuraou.wasm',
]) {
  if (!files.includes(required)) failures.push(`missing ${required}`)
}

// 4. ai-worker.js must reach users with its license header intact.
const aiWorker = readFileSync(join(clientDir, 'games/shogi/engine/ai-worker.js'), 'utf8')
if (!aiWorker.startsWith('// SPDX-License-Identifier: GPL-3.0-only')) {
  failures.push('ai-worker.js lost its SPDX header')
}

// 5. No secret from .dev.vars may end up in build output. The Vite plugin
//    copies .dev.vars to dist/server/.dev.vars for local preview; that one copy
//    is expected (CI never has .dev.vars and excludes it from the artifact),
//    every other file in dist is scanned.
if (existsSync('.dev.vars')) {
  const secrets = readFileSync('.dev.vars', 'utf8')
    .split('\n')
    .map((line) => line.match(/^\s*(?:export\s+)?[A-Za-z0-9_]+\s*=\s*(.*?)\s*$/)?.[1])
    .map((value) => value?.replace(/^(['"])(.*)\1$/, '$2'))
    .filter((value) => value && value.length >= 8)
  for (const path of walk('dist')) {
    if (path === join('dist', 'server', '.dev.vars')) continue
    const body = readFileSync(path, 'latin1')
    if (secrets.some((s) => body.includes(s))) failures.push(`a .dev.vars value appears in ${path}`)
  }
}

// 7. Pages are written as /name.html (autoSubfolderIndex: false). A nested
//    index.html would be a second copy served at /name/ (duplicate content).
for (const f of files) {
  if (f !== '/index.html' && f.endsWith('/index.html')) failures.push(`duplicate page ${f} (skip trailing-slash paths in prerender)`)
}

// 6. env/.env is committed and ships to the browser: only the known public keys.
const PUBLIC_KEYS = ['VITE_SITE_URL', 'VITE_CONTACT_EMAIL', 'VITE_SOURCE_URL', 'VITE_PLAUSIBLE_SRC']
for (const key of Object.keys(publicEnv)) {
  if (!PUBLIC_KEYS.includes(key)) failures.push(`env/.env has ${key}: only public keys (${PUBLIC_KEYS.join(', ')}) belong there`)
}

if (failures.length) {
  console.error('check-build failed:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}
console.log(`check-build: ok (${files.length} client files)`)
