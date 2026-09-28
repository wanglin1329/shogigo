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
- 技演出（`WazaEffect`）の出し入れは上流 `maybeShowWaza` と同じ規則。**相手の着手では消さない**（AI は 1 秒以内に応手するので、消すと演出が見えない）。`trigger` は実際に指した時だけ変わる値（盤のアニメ id）を渡す
- 対局記録は同じ id で保存し直すと上書き。id は AI・将棋盤が `GameMeta`（localStorage）、通信対戦が `部屋コード:created_at`（部屋コードは期限切れ後に再利用される）。新しい対局を始める処理では必ず新しい `GameMeta` を作る
- 公開設定（サイトURL・問い合わせ先・ソースURL・Plausible）は入庫している `env/.env`（Vite `envDir`）。**公開値だけ**。秘密値を入れない
- ゲームページの文案は `src/content/*.tsx`。字数・句点位置・禁用词は `test/core/copy.spec.ts` が検査する。事実（強さの段階、千日手、30秒/60秒など）はコードで確かめてから書く。**文案を直したら同じコミットで `src/content/lastmod.ts` の日付も直す**（sitemap の lastmod はここだけが出どころ。`new Date()` 禁止）
- 新しい公開ページは `LASTMOD` に足す（sitemap に入る）。sitemap.xml / robots.txt は server route をビルド時に静的化（`vite.config.ts` の `pages`）
- workers.dev は noindex（静的ファイルは `public/_headers` のホスト指定、Worker の応答は `server.ts`）。独自ドメイン確定後は `workers_dev: false`
- OG 画像・アイコンは `scripts/og/generate.py` で作って入庫（CI では作らない）
- 色は `styles.css` のトークンだけを使う。トークンはライトと `:root[data-theme='dark']` の2か所に必ず両方書く。盤・駒台の上の文字や駒の字は `--piece-ink`（ダークでも黒のまま）、濃い地に白文字の部品は `--inverse-bg/fg`。テーマは `<html data-theme>` を `src/site/theme.ts` の早期スクリプトが描画前に設定する
- 配色は暖色系のみ、アクセントは朱（`--shu` / `--shu-deep`）の1色。灰色は `--ink-soft`、影は `--shadow-rgb`（紙の色味）で、`rgb(0 0 0 / …)` や寒色の灰を持ち込まない。アイコンは `src/site/icons.tsx`（⚙✕▸ などの文字で代用しない）
- ルール入門は `src/content/guide/`（章ごとに `chapters/0N-<slug>.ts`、ファイル名の slug は章の slug と同じにする：check-build がそこから期待ページを作る）。章の日付は各章の `updatedAt`。駒の動きの点は `moveMarks()`（ルールエンジンの動き表）から作り、手書きしない
- 「本作では」と書く事実は必ずコードで確かめる。一般ルールは日本将棋連盟の対局規則に合わせる（入玉宣言の点数条件は未確認なので書いていない）
- `src/styles/*.css` は `styles.css` の先頭で `@import` されるので、同じ詳細度なら styles.css 本体のルールが勝つ。上書きしたいときは詳細度を上げる（`desktop.css` は `body .game`）
- 対局画面の3つの包み（`game-top` / `game-main` / `game-bottom`）は、スマホでは `display: contents`、1024px 以上で2カラムのグリッドになる。対局画面に要素を足すときは、どの包みに入れるかを決める
- リモート：`origin` は非公開の `wanglin1329/shigigo`（普段の push 先）。公開リポジトリは `wanglin1329/shogi`（サイトの GitHub リンク先）。**公開リポジトリへの push はユーザーが明示的に指示したときだけ**（デプロイのついでに push しない）
- 本番の D1 は変更のたびに `wrangler d1 migrations apply shogi --remote` を先に
- ポート: dev 3160 / preview 3161（3100・3101 はユーザー用）
