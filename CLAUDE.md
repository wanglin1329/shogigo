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
- 盤上に重ねる UI（成りの選択・新手デモ）は `Board` の `overlay` に渡す。盤の外に置くと座標がずれる
- AI の答えは `positionKey()` と世代番号で照合してから適用する。リセット・待った・強さ変更は `ai.cancel()` を同期で呼ぶ（effect の後始末を待つと古い答えが新しい対局に入る）
- `localStorage` を読むのは水和の後（effect の中）だけ。プリレンダーされた HTML と初回描画を一致させるため。キーは `src/site/storage.ts` 経由（接頭辞 `sg.`）
- 駒の向きは「持ち主が後手」XOR「盤が反転」（`Piece` の `flipped`）
- 対局中の移動は `useBlocker` で確認 → 投了が届いてから遷移（`OnlineGame`）。部屋を離れる操作は必ずこの流れに乗せる
- 評価の書き込みは D1 バッチ内で版（対局数）を確認する楽観的並行制御。読んでから書く形に戻さない（並行結算で上書き・上限すり抜けが起きる）
- 段級位を隠した人の評価・段位は受け手ごとに消す（`redactRatings`）。MatchPayload を全員に同じ物を送らない
- 本番の D1 は変更のたびに `wrangler d1 migrations apply shogi --remote` を先に
- ポート: dev 3160 / preview 3161（3100・3101 はユーザー用）
