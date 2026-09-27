# CLAUDE.md

将棋サイト（将来は他の盤・カードゲームも載る多ゲームサイト）。TanStack Start + Cloudflare Workers、**GPL-3.0-only で全ソース公開**。与用户交互一律使用中文。

- 計画・決定事項・修訂記録: [docs/PLAN.md](docs/PLAN.md)。着手前に該当節を読む
- 上流（参照・移植元）: `/Users/yl/project/downgame/shogi-upstream`（読み取り専用）

## 落とし穴

- **SSR のルートは `src/site/ssr-routes.json` に登録する**。TanStack のプリレンダリングはリンクを辿って全ページを静的化し、静的ファイルは Worker より先に返される。登録漏れは `pnpm build` の check-build で落ちる
- **Workers Caching が有効**（wrangler.jsonc `cache`）。Cache-Control の無いレスポンスは既定で 2 時間キャッシュされるため、`src/server.ts` が `no-store` を補う。キャッシュさせたいルートは明示的にヘッダーを付ける
- `/api/*` は `src/api.ts` で 1 本ずつ照合し、TanStack に落とさない。WS の token は DO を起こす前に検証する。DO へ転送するときはクライアント由来の `x-match-*` / `x-mm-*` を必ず落とす（`forwardTo()`）
- テストの Worker 入口は `test/worker-entry.ts`（`src/server.ts` の TanStack 仮想モジュールは vitest から解決できない）
- `public/games/shogi/engine/` は GPL のまま配布する上流ファイル。改変したら冒頭に `Modified <date>: …` を書く。やねうら王の版を変えたらディレクトリ名（`yaneuraou-v7.63`）と `third_party/yaneuraou/` を同時に更新
- **公開リポジトリ**: 秘密値は `wrangler secret put` / `.dev.vars` のみ。専用テンプレート（ShipAny 等）のコードを持ち込まない
- ポート: dev 3160 / preview 3161（3100・3101 はユーザー用）
