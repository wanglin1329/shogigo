// SPDX-License-Identifier: GPL-3.0-only

// Smoke test of public/games/shogi/engine/yaneuraou-worker.js against the
// real やねうら王 wasm. The worker file runs unmodified inside a Node vm with a
// fake `self` / importScripts / fetch that serve files from public/, so the
// same USI sequence and state machine as in the browser are exercised.
//
//   node scripts/engine-smoke.mjs            # variant chosen by SIMD detection (sse42 on Node)
//   node scripts/engine-smoke.mjs --nosimd   # force the nosimd build

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import vm from 'node:vm'

const PUBLIC = resolve('public')
const forceNoSimd = process.argv.includes('--nosimd')

function filePath(url) {
  return join(PUBLIC, new URL(url, 'http://localhost/').pathname)
}

const messages = []
let waiters = []

const wasmApi = forceNoSimd
  ? {
      ...WebAssembly,
      // The worker's SIMD probe is a 31-byte module; make it fail.
      instantiate: (bytes, imports) =>
        bytes?.byteLength === 31 ? Promise.reject(new Error('no simd')) : WebAssembly.instantiate(bytes, imports),
    }
  : WebAssembly

const context = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  performance,
  WebAssembly: wasmApi,
  TextDecoder,
  TextEncoder,
  URL,
  Response,
  location: { href: 'http://localhost/games/shogi/engine/yaneuraou-worker.js' },
  importScripts: (...urls) => {
    for (const url of urls) vm.runInContext(readFileSync(filePath(url), 'utf8'), context, { filename: url })
  },
  fetch: async (url) =>
    new Response(readFileSync(filePath(String(url))), {
      headers: { 'content-type': String(url).endsWith('.wasm') ? 'application/wasm' : 'text/javascript' },
    }),
  postMessage: (message) => {
    messages.push(message)
    waiters = waiters.filter((w) => !w(message))
  },
}
context.self = context
vm.createContext(context)
vm.runInContext(readFileSync(join(PUBLIC, 'games/shogi/engine/yaneuraou-worker.js'), 'utf8'), context, {
  filename: 'yaneuraou-worker.js',
})

const send = (data) => context.onmessage({ data })

function waitFor(predicate, timeoutMs = 60_000) {
  const found = messages.find(predicate)
  if (found) return Promise.resolve(found)
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for worker message')), timeoutMs)
    waiters.push((message) => {
      if (!predicate(message)) return false
      clearTimeout(timer)
      resolvePromise(message)
      return true
    })
  })
}

let requestId = 0
async function think(initialSfen, usiMoves, nodes) {
  const id = ++requestId
  const t0 = performance.now()
  send({ type: 'think', requestId: id, initialSfen, usiMoves, nodes })
  const answer = await waitFor((m) => m.requestId === id)
  if (answer.type !== 'bestmove') throw new Error(`think ${id} failed: ${answer.message}`)
  return { ...answer, wallMs: Math.round(performance.now() - t0) }
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`ok   ${message}`)
}

const USI_MOVE = /^([PLNSGBR]\*[1-9][a-i]|[1-9][a-i][1-9][a-i]\+?)$/

// 1. init
const t0 = performance.now()
send({ type: 'init' })
const ready = await waitFor((m) => m.type === 'ready' || (m.type === 'error' && m.requestId === undefined))
assert(ready.type === 'ready', `init → ready (${ready.variant}, ${Math.round(performance.now() - t0)} ms)`)

// 2. startpos at 達人級
const master = await think(null, [], 5_000)
assert(USI_MOVE.test(master.usi), `startpos 達人級 → ${master.usi} (${master.wallMs} ms, cp ${master.scoreCp})`)

// 3. legendary3 budget, for timing
const legend = await think(null, ['7g7f', '3c3d'], 1_000_000)
assert(USI_MOVE.test(legend.usi), `伝説3 (1M nodes) → ${legend.usi} (${legend.wallMs} ms)`)

// 4. non-平手 start: 香落ち, 上手 (gote) moves first; then continue with moves
const kyoOchi = 'lnsgkgsn1/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1'
const first = await think(kyoOchi, [], 10_000)
assert(USI_MOVE.test(first.usi), `position sfen (香落ち) → ${first.usi} (${first.wallMs} ms)`)
const reply = await think(kyoOchi, [first.usi], 10_000)
assert(USI_MOVE.test(reply.usi), `position sfen … moves ${first.usi} → ${reply.usi}`)

// 5. mate in 1: G*5b
const mate1 = await think('4k4/9/4P4/9/9/9/9/9/4K4 b G 1', [], 5_000)
assert(mate1.usi === 'G*5b' && mate1.mate === 1, `mate in 1 → ${mate1.usi} (mate ${mate1.mate})`)

// 6. entering-king position: without NoEnteringKing the engine answers `bestmove win`
const nyugyoku = '1+R+B+SG+S+B+R1/+P+P+PKG+P+P+P+P/2G6/9/9/9/9/9/4k4 b - 1'
const king = await think(nyugyoku, [], 5_000)
assert(king.usi !== 'win' && USI_MOVE.test(king.usi), `NoEnteringKing: no bestmove win (got ${king.usi})`)

// 7. a running search superseded by a newer request is discarded
const before = messages.length
const staleId = ++requestId
send({ type: 'think', requestId: staleId, initialSfen: null, usiMoves: [], nodes: 200_000 })
// Wait until the worker has actually sent `go` for the stale request, so this
// exercises the in-flight path (not just replacement of a queued request).
const inFlight = () => vm.runInContext('searching && searching.requestId', context)
for (let i = 0; i < 100 && inFlight() !== staleId; i++) await Promise.resolve()
assert(inFlight() === staleId, 'stale request is searching')
const freshId = ++requestId
send({ type: 'think', requestId: freshId, initialSfen: null, usiMoves: ['7g7f'], nodes: 5_000 })
const fresh = await waitFor((m) => m.requestId === freshId)
const answers = messages.slice(before).filter((m) => m.type === 'bestmove')
assert(
  fresh.type === 'bestmove' && answers.length === 1 && answers[0].requestId === freshId,
  'superseded search is discarded; only the latest request is answered',
)

// 8. cancel drops the request; the next one is answered
const cancelledId = ++requestId
const mark = messages.length
send({ type: 'think', requestId: cancelledId, initialSfen: null, usiMoves: [], nodes: 5_000 })
send({ type: 'cancel' })
const after = await think(null, ['2g2f'], 5_000)
assert(
  !messages.slice(mark).some((m) => m.requestId === cancelledId) && USI_MOVE.test(after.usi),
  'cancelled request is never answered; the next one is',
)

// 9. newGame sends usinewgame before the next search (must not break it)
send({ type: 'newGame' })
const afterNewGame = await think(null, [], 5_000)
assert(USI_MOVE.test(afterNewGame.usi), `after newGame → ${afterNewGame.usi}`)

// 10. JS ai-worker.js (入門〜超級) accepts the core engine's GameState as-is
const engine = await import('../src/games/shogi/core/engine/index.ts')
const jsMessages = []
const jsContext = { console, performance, Math, Date, Map, Set, postMessage: (m) => jsMessages.push(m) }
jsContext.self = jsContext
vm.createContext(jsContext)
vm.runInContext(readFileSync(join(PUBLIC, 'games/shogi/engine/ai-worker.js'), 'utf8'), jsContext, {
  filename: 'ai-worker.js',
})
const opening = engine.applyMove(engine.createInitialGameState(), {
  type: 'move', fromX: 2, fromY: 6, toX: 2, toY: 5, promote: false,
}).state
for (const level of ['novice', 'easy', 'medium', 'hard', 'super']) {
  const started = performance.now()
  jsContext.onmessage({
    data: {
      type: 'getBestMove',
      data: {
        board: structuredClone(opening.board),
        capturedPieces: structuredClone(opening.capturedPieces),
        currentPlayer: opening.currentPlayer,
        moveCount: 1,
        lastMoveDetail: { fromX: 2, fromY: 6, toX: 2, toY: 5 },
        aiDifficulty: level,
        aiPlayer: 'gote',
        josekiEnabled: false,
        currentJosekiPattern: null,
        josekiMoveIndex: 0,
        requestId: level,
      },
    },
  })
  const answer = jsMessages.find((m) => m.data?.requestId === level)?.data
  let legal = false
  try {
    engine.applyMove(opening, { ...answer.move, promote: answer.move.promote === true })
    legal = true
  } catch {}
  assert(legal, `ai-worker.js ${level} → legal move for gote (${Math.round(performance.now() - started)} ms)`)
}

console.log(`\nall smoke checks passed`)
process.exit(0)
