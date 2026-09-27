// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2025~ Yuki Lab
// Copyright 2026 the shogi project contributors
// Modified 2026-09-27:
//   - Rewritten as a strict request state machine: at most one `go` in flight;
//     only the latest pending request is kept; a superseded search's bestmove
//     is consumed and discarded before the next `go` (the original kept a
//     single pendingResolve, so an old position's bestmove could answer a new
//     request).
//   - Positions are sent as `position startpos moves …` (平手) or
//     `position sfen <initialSfen> moves …` (any other start), never a bare
//     SFEN without history.
//   - setoption EnteringKingRule NoEnteringKing (the site does not implement
//     入玉宣言; the original reported `bestmove win` as a loss for the engine).
//   - `usinewgame` on newGame; score (cp / mate) reported with the bestmove.
//   - Assets load from the versioned directory yaneuraou-v7.63/, so the
//     `?v2` cache buster and the Cache API cleanup are gone.
//
// YaneuraOu (https://github.com/yaneurao/YaneuraOu) is GPL-3.0; its
// Corresponding Source is in third_party/yaneuraou/ of this repository.
//
// Protocol (main thread → worker):
//   { type: 'prefetch' }                      download js+wasm into the HTTP cache only
//   { type: 'init' }                          instantiate + USI handshake → 'ready'
//   { type: 'newGame' }                       usinewgame before the next search
//   { type: 'think', requestId, initialSfen, usiMoves, nodes }
//   { type: 'cancel' }                        drop the pending request, discard the running one
// Worker → main thread:
//   { type: 'ready', variant }
//   { type: 'bestmove', requestId, usi, scoreCp?, mate?, thinkingMs }
//        usi is a USI move, 'resign' or 'win'
//   { type: 'error', requestId?, message }   no requestId = initialization failed

'use strict';

const ENGINE_DIR = '/games/shogi/engine/yaneuraou-v7.63';
const INIT_TIMEOUT_MS = 120000;
// Upper bound for waiting on an idle-time prefetch before loading anyway: a
// slow 3G line needs ~30s for 1.4MB; re-downloading in parallel would be worse.
const PREFETCH_WAIT_MS = 60000;

let variantPromise = null;
let prefetchPromise = null;
let initPromise = null;
let engine = null;
let onUsiLine = null; // handshake listener, then null

// Search state machine.
let searching = null; // { requestId, discard, startedAt, score }
let pending = null; // latest think request not yet started
let starting = false; // waiting for init() before starting `pending`
// The first search after init also starts a game.
let newGamePending = true;

async function detectSimd() {
  try {
    const simdTest = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
      0x03, 0x02, 0x01, 0x00, 0x0a, 0x0a, 0x01, 0x08, 0x00, 0x41, 0x00, 0xfd, 0x0f, 0xfd, 0x62,
      0x0b,
    ]);
    await WebAssembly.instantiate(simdTest);
    return true;
  } catch (e) {
    return false;
  }
}

function resolveVariant() {
  if (!variantPromise) {
    variantPromise = detectSimd().then((simd) => (simd ? 'sse42' : 'nosimd'));
  }
  return variantPromise;
}

function assetUrl(variant, file) {
  return `${ENGINE_DIR}/${variant}/yaneuraou.${file}`;
}

function prefetch() {
  if (engine || initPromise) return Promise.resolve();
  if (prefetchPromise) return prefetchPromise;
  prefetchPromise = (async () => {
    const variant = await resolveVariant();
    await Promise.all(
      ['js', 'wasm'].map(async (file) => {
        const response = await fetch(assetUrl(variant, file), { credentials: 'same-origin' });
        if (!response.ok) throw new Error(`prefetch failed: ${response.status}`);
        await response.arrayBuffer();
      }),
    );
  })().catch((error) => {
    prefetchPromise = null; // init will download again
    throw error;
  });
  return prefetchPromise;
}

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function init() {
  if (!initPromise) {
    initPromise = withTimeout(startEngine(), INIT_TIMEOUT_MS, 'Engine initialization timeout').catch(
      (error) => {
        initPromise = null;
        engine = null;
        throw error;
      },
    );
  }
  return initPromise;
}

async function startEngine() {
  const variant = await resolveVariant();
  if (prefetchPromise) {
    await Promise.race([
      prefetchPromise.catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, PREFETCH_WAIT_MS)),
    ]);
  }
  try {
    importScripts(assetUrl(variant, 'js'));
  } catch (e) {
    throw new Error(`Failed to load YaneuraOu script: ${e && e.message}`);
  }
  const factoryName = variant === 'sse42' ? 'YaneuraOu_sse42' : 'YaneuraOu_nosimd';
  const factory = self[factoryName];
  if (typeof factory !== 'function') throw new Error(`${factoryName} not found`);

  const instance = await factory({
    locateFile: (path) => `${ENGINE_DIR}/${variant}/${path}`,
  });
  if (instance.ready) await instance.ready;
  instance.addMessageListener(handleEngineLine);

  await new Promise((resolve) => {
    onUsiLine = (line) => {
      if (line === 'usiok') {
        instance.postMessage('setoption name Threads value 1');
        // The default (1024MB) cannot be allocated in wasm32 and the engine hangs.
        instance.postMessage('setoption name USI_Hash value 16');
        instance.postMessage('setoption name EnteringKingRule value NoEnteringKing');
        instance.postMessage('isready');
      } else if (line === 'readyok') {
        onUsiLine = null;
        resolve();
      }
    };
    instance.postMessage('usi');
  });
  engine = instance;
  return variant;
}

function parseScore(line, target) {
  const cp = /\bscore cp (-?\d+)/.exec(line);
  if (cp) {
    target.scoreCp = Number(cp[1]);
    target.mate = undefined;
    return;
  }
  const mate = /\bscore mate (-?\d+|[+-])/.exec(line);
  if (mate) {
    const raw = mate[1];
    target.mate = raw === '+' ? 1 : raw === '-' ? -1 : Number(raw);
    target.scoreCp = undefined;
  }
}

function handleEngineLine(line) {
  if (onUsiLine) {
    onUsiLine(line);
    return;
  }
  if (!searching) return;
  if (line.startsWith('info ')) {
    parseScore(line, searching.score);
    return;
  }
  if (!line.startsWith('bestmove')) return;

  const finished = searching;
  searching = null;
  if (!finished.discard) {
    const usi = line.split(/\s+/)[1] || 'resign';
    const message = {
      type: 'bestmove',
      requestId: finished.requestId,
      usi,
      thinkingMs: Math.round(performance.now() - finished.startedAt),
    };
    if (finished.score.scoreCp !== undefined) message.scoreCp = finished.score.scoreCp;
    if (finished.score.mate !== undefined) message.mate = finished.score.mate;
    self.postMessage(message);
  }
  pump();
}

function positionCommand(initialSfen, usiMoves) {
  const moves = usiMoves.length ? ` moves ${usiMoves.join(' ')}` : '';
  return initialSfen ? `position sfen ${initialSfen}${moves}` : `position startpos${moves}`;
}

// Starts the pending request when the engine is idle. The request stays in
// `pending` until the search actually starts, so a newer request arriving
// during initialization simply replaces it.
function pump() {
  if (searching || starting || !pending) return;
  starting = true;
  init().then(
    () => {
      starting = false;
      if (searching || !pending) return;
      const request = pending;
      pending = null;
      startSearch(request);
    },
    (error) => {
      starting = false;
      self.postMessage({ type: 'error', message: error.message });
      if (pending) {
        self.postMessage({ type: 'error', requestId: pending.requestId, message: error.message });
        pending = null;
      }
    },
  );
}

function startSearch(request) {
  if (newGamePending) {
    engine.postMessage('usinewgame');
    newGamePending = false;
  }
  searching = { requestId: request.requestId, discard: false, startedAt: performance.now(), score: {} };
  engine.postMessage(positionCommand(request.initialSfen, request.usiMoves));
  engine.postMessage(`go nodes ${request.nodes}`);
}

self.onmessage = (event) => {
  const data = event.data || {};
  switch (data.type) {
    case 'prefetch':
      prefetch().catch(() => {}); // best effort; init downloads again if needed
      break;
    case 'init':
      init().then(
        (variant) => self.postMessage({ type: 'ready', variant }),
        (error) => self.postMessage({ type: 'error', message: error.message }),
      );
      break;
    case 'newGame':
      newGamePending = true;
      break;
    case 'think': {
      const usiMoves = Array.isArray(data.usiMoves) ? data.usiMoves.filter(Boolean) : [];
      const nodes = Number.isFinite(data.nodes) && data.nodes > 0 ? Math.floor(data.nodes) : 10000;
      // Only the latest request matters: a running search becomes stale and
      // an older queued one is replaced.
      if (searching) searching.discard = true;
      pending = { requestId: data.requestId, initialSfen: data.initialSfen || null, usiMoves, nodes };
      pump();
      break;
    }
    case 'cancel':
      pending = null;
      if (searching) searching.discard = true;
      break;
    default:
      break;
  }
};
