# shogi

ブラウザで遊べる将棋サイト（AI 対戦・将棋盤・通信対戦）。TanStack Start + Cloudflare Workers（Durable Objects / D1）。

GPL-3.0-only。第三者コンポーネントについては [NOTICE.md](NOTICE.md)。

## 開発

```bash
pnpm install          # postinstall で wrangler types（worker-configuration.d.ts）を生成
cp .dev.vars.example .dev.vars
pnpm dev              # http://localhost:3160 （SSR・DO・D1・WebSocket すべてローカルで動く）
pnpm test             # core（Node）+ worker（workerd 内で API / DO）
pnpm typecheck
pnpm build            # vite build（プリレンダリング込み）+ scripts/check-build.mjs
pnpm preview          # 本番ビルドを http://localhost:3161 で確認
```

計画と設計は [docs/PLAN.md](docs/PLAN.md)。
