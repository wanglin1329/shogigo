# 将棋サイト 新規プロジェクト 実装計画（v3）

> 状态：v3.1，P0 / P1 / P3 / P2 / P5a 完成（§9.1–9.6）。M1 只剩上线操作（§9.5-7 清单）。D1–D7 全部已定（§1.1）。修订经过见文末「修订记录」。
> 调研原始报告：`docs/research/`（A 对局 UX / B AI 引擎 / C 联机协议逆向 / D 内容与 SEO / E 上游源码）。
> 参考站：参考站 。其源码 **全部以 GPL-3.0 公开**：参考站的源码
> 本地只读副本：`/Users/yl/project/downgame/shogi-upstream`（源码）、`/Users/yl/project/downgame/shogi-live-20260927`（线上快照）。

---

## 0. 目标与原则

- **首页 `/` 就是可玩的将棋（对 AI）**，与参考站一致；另有 `/board/`（一台设备两人对局）、`/online/`（联机）。
- **将来还会加其他棋类、牌类游戏**：架构按「多游戏站」设计，但首发只做将棋，不为还不存在的游戏预先抽象（§2.4）。
- **前端 React 重写**；**AI 与参考站用同一套引擎文件与参数**（同一个 やねうら王 wasm + 同一个 JS AI，11 档参数相同，棋力相当；细节见 §5.1）。
- **联机用 Cloudflare Workers + Durable Objects**。
- 参考站里凡是对用户体验有利的细节全部吸收（清单见 §5），它做得弱的地方做得更好（§5.4）。
- 文案、题目、图片一律自己做：代码许可允许复用，但同文会被判重复内容，品牌也必须区分。
- 最简原则：不做账号体系、不接站群数据库（Supabase/gamemanager），站点完全独立。

---

## 1. 决策

### 1.1 已定（2026-09-27）

| # | 事项 | 结论 |
|---|---|---|
| **D1** | 许可证路线 | **A：本项目以 GPL-3.0-only 公开源码**，直接移植上游约 1 万行纯逻辑 TS（服务端、规则引擎、棋谱、技判定、诘将棋求解器、昵称、战绩存储），只重写 UI。**整站前端源码公开，包括以后加进来的游戏** |
| **D4** | 匹配等不到人时切 COM 的秒数 | **30 秒**（服务端 `BOT_FALLBACK_SECONDS`，可配）。上游把「等 60 秒才发 ticket」当作 COM 局限流的一环，改 30 秒后这个上限翻倍；每日 20 局上限不变。P3 移植时同步改注释、假设和测试（`matchmaker.ts:343`） |
| **D2** | 品牌名 / 域名 | **shogigo / `shogigo.com`**（2026-09-27 在 Cloudflare Registrar 注册）。不用「参考站」及其 logo |
| **D5** | 统计 / 广告 | **首发只上 Plausible**（与其他站同一个自建实例，脚本地址走环境变量，没配就不加载）。不放广告和广告位，隐私政策也不写 AdSense；以后要加时再改隐私政策 |
| **D6** | 运营者 / 联系方式 / 源码 | 运营者「shogigo運営事務局」；联系邮箱 `hi@shogigo.com`（走配置，空则お問い合わせ页 404；需在 Cloudflare Email Routing 转发）；源码仓库 `github.com/wanglin1329/shigigo`（上线时改为公开）。域名在 P5a 完成后再绑定 |
| **D7** | 水匠 Petite 评价函数 | **按现状分发，不单独向作者确认**（用户 2026-09-27 决定，已知有一定权利风险）。与参考站、mizar 的 GPL 发布包做法相同；在 `/license` 和 NOTICE 里写明出处（たややん）。调查过程：mizar/YaneuraOu.wasm 的 README 与发布页、やねうら王官网的水匠5 单体发布公告、`yaneurao/YaneuraOu` 的 suisho5 发布页，都没有写明许可条款 |
| **D3** | 框架与部署 | **TanStack Start 官方 Cloudflare 起步方式（MIT）**：`@cloudflare/vite-plugin` 构建，部署到一个 Worker。页面、`/api/*`、DO、D1 同源。不用 ShipAny：它的协议禁止公开源码，与 D1 冲突；而且支付、积分、RBAC 等功能都用不上 |

### 1.2 仍待拍板

目前没有。

### 1.3 GPL 合规清单（D1）

GPL 是「分发时生效」：

1. 浏览器下载 JS/wasm 就算分发，所以**前端源码必须公开**：公开 GitHub 仓库，页脚放「ソースコード」链接。
2. 服务端（Worker）不分发给用户，GPL（不是 AGPL）对它没有公开义务。放在同一仓库一起公开最省事。
3. 保留上游文件的 SPDX 头和版权声明，在旁边追加我们自己的版权行；**修改过的文件注明修改人和日期**。全部代码按 **GPL-3.0-only** 发布（上游是 only，不能写 or-later）。
4. **wasm 的「对应源码」要完整镜像**到 `third_party/`，和所发的 wasm 版本一一对应：
   - mizar v7.6.3 发布包里的 `source.tar.xz` 与 `Copying.txt`；
   - 上游的 `yaneuraou_wasm_build/` 全部内容（Dockerfile、Makefile、补丁、`wasm_pre.js`、构建脚本）。
5. **水匠 Petite 权重**：已核实 mizar 发布包里只有 GPL 的 `Copying.txt`，没有针对权重的单独条款。**P0 仍要去作者公开的说明页再确认一次**再上线。
6. 依赖库的许可证逐一核对：TanStack、React、Tailwind 等 MIT 类许可与 GPL 兼容；新加任何依赖都要先查许可。
7. 维护上：以后每次更新引擎，都要同步更新对应源码。**不要把任何专有模板或专有素材（包括 ShipAny 的代码）拷进这个仓库。**

公开之后竞争者可以拿去用，这是 A 路线在商业上的代价（已接受）。

---

## 2. 技术架构

### 2.1 总览

```
浏览器 ──https──▶ Cloudflare Worker（一个，main = src/server.ts）
                 ├─ Static Assets：Vite 客户端产物 + 预渲染的 HTML + public/（wasm 等）
                 │    命中静态资源的请求不进 Worker、不计费
                 └─ Worker 脚本
                       ├─ /api/*（联机端点清单见下）→ 联机路由（移植自上游 index.ts）
                       │     ├─ MatchRoom DO（每房间一个，SQLite，Hibernation WS）
                       │     └─ Matchmaker DO（全局单例 "global"）
                       ├─ 其他请求 → TanStack Start 的 handler（SSR 页面、server routes）
                       └─ D1：player_rating / rated_game / feedback /（后期）backup
```

- **TanStack Start + `@cloudflare/vite-plugin`**（`cloudflare({ viteEnvironment: { name: "ssr" } })`）。用官方命令起步：`npm create cloudflare@latest -- <name> --framework=tanstack-start`。
- **`src/server.ts` 是 Worker 入口**（`wrangler.jsonc` 的 `main` 指向它）：
  - 导出 DO 类：`export { MatchRoom } …; export { Matchmaker } …`；
  - `fetch` 先按路径把联机 API 和 WebSocket 升级交给移植来的联机路由，其余交给 `handler.fetch`（TanStack）。联机代码因此几乎不用改，也不依赖框架。
  - 绑定通过 `import { env } from "cloudflare:workers"` 读取。
- **页面渲染按内容选方式**：
  - **构建时预渲染**（`tanstackStart({ prerender: { enabled: true } })`）：游戏页、技図鑑文章、法务页等文案在代码里的页面。它们作为静态资源分发，**不消耗 Worker 请求**。
  - **按请求 SSR**：内容会随时间变的页面，例如每日诘将棋（按 JST 日期出当天的题）、`sitemap.xml`、将来的排行、评论。
  - ⚠️ **TanStack 默认会找出所有静态路径去预渲染**，而 Cloudflare 会优先返回命中的静态文件，请求根本到不了 Worker。所以 SSR 的路由必须**在预渲染配置里显式排除**（`/tsume/`、`/sitemap.xml` 等），并由构建后检查脚本断言产物里没有这些 HTML。
  - **边缘缓存（P0 已定）：Workers Caching**（`wrangler.jsonc` 的 `"cache": { "enabled": true }`），缓存命中时 Worker 不运行、不计费。
    - ⚠️ 它对 Worker 的**所有**响应生效；没有 `Cache-Control` 的 200 响应会被按默认规则缓存 2 小时。所以 `src/server.ts` 给所有没写缓存头的响应补上 `no-store`，**只有显式写了缓存头的路由才会被缓存**。
    - 要缓存的路由：浏览器用 `Cache-Control: public, max-age=0, must-revalidate`，边缘用 `Cloudflare-CDN-Cache-Control: max-age=<到下一个 JST 零点的秒数>`。
    - 带 `Set-Cookie` 的响应不会被缓存（平台规则）；个人数据的接口一律 `no-store`。
    - 线上是否按预期命中，要等部署后核实（本地 dev/preview 不模拟这层缓存）。
  - 这就是选 SSR 框架的理由：以后加游戏、加数据库驱动的功能（评分、评论、排行、每日内容），都不必每天重建部署。
- **开发**：`vite dev --port 3160`，**单端口**。Cloudflare Vite 插件在 dev 时用 workerd 跑服务端环境，D1 和 DO 都在本地模拟（P0 要实测确认 DO 和 WebSocket 在 dev 下可用）。因为同源，**不需要 API 基址转换、不需要开发期 CORS**。`vite preview` 或 `wrangler dev` 用来在本地验证生产构建。
- 端口约定：3100/3101 属于用户自己；本项目默认 3160，本地预览用 3161。
- 路由细节：
  - `/?k=`、`/?waza=`、`/online/?room=` 用 TanStack Router 的 `validateSearch` 定义成**有类型的查询参数**。
    - 预渲染的 HTML 生成时没有这些参数。如果首次渲染就按参数改变棋盘或房间，会和静态 HTML 的水合对不上。
    - 所以：**先水合一个与静态 HTML 一致的外壳，水合完成后再在客户端应用参数**（切换到棋谱查看、加入房间）。
    - P0 验收：直接打开、刷新带参数的深链接，浏览器控制台都没有水合错误。
  - wasm 的响应头（`Content-Type: application/wasm`、`immutable`）写进 `public/_headers`（Workers Static Assets 支持）；P0 要确认 Vite 插件的产物里带着它。
  - 尾斜杠统一一种写法：TanStack 预渲染的 `autoSubfolderIndex` 与 assets 的 `html_handling` 设成一致。注意 `html_handling` 的自动跳转是 **307**，不是 301。canonical 一律写规范形式。

**联机路由（由 `src/server.ts` 在交给 TanStack 之前处理，照上游 `index.ts` 的实际端点）：**

| 端点 | 说明 |
|---|---|
| `GET /api/match/ws` | WebSocket 升级 → Matchmaker DO |
| `GET /api/rooms/{code}/ws?token=` | **先在 Worker 里验 token**（签名、过期、房间码一致），再把升级请求转给 MatchRoom DO |
| `POST /api/rooms`、`POST /api/rooms/{code}/{join,settings,move,resign}`、`GET /api/rooms/{code}/state` | 房间 HTTP 接口 |
| `GET /api/online-stats` | 在线人数 + （带 uid 时）个人段位 |
| `POST /api/bot-result` | COM 局结果上报 |
| `POST /api/feedback`（P6） | 反馈 |

- 路由表**逐条匹配**，不用 `/api/*` 通配后再分派。未匹配的 `/api/*` 返回 JSON 404，不能落进 TanStack。
- WS 升级请求直接返回 DO 给的 101 响应，不经过 TanStack 的 handler。
- 两个 WS 端点都要有测试。

### 2.2 目录（按「多游戏站」组织）

```
<repo>/
├─ LICENSE                      GPL-3.0 全文
├─ NOTICE.md                    上游版权与致谢（参考站 / やねうら王 / mizar / usumerican / 水匠）+ 修改说明
├─ wrangler.jsonc               main = src/server.ts；DO 与 D1 绑定；route = 自有域名
├─ migrations/                  D1（从上游移植，按功能裁剪）
├─ src/
│  ├─ server.ts                 Worker 入口：导出 DO；联机路由优先，其余交给 TanStack
│  ├─ routes/                   TanStack 文件路由：/、/board、/online、/records、/tsume、/waza/…、法务页
│  ├─ site/                     全站共用：页头页脚、布局、SEO 辅助、广告位、统计、法务文案
│  ├─ games/
│  │  └─ shogi/
│  │     ├─ core/               ★纯逻辑，前后端共用（无 DOM、无 Worker API）
│  │     │  ├─ engine/          ← 上游 src/worker/shogi_engine.ts（页面与服务端共用的规则实现）
│  │     │  ├─ kifu/            ← 上游 src/kifu/*
│  │     │  ├─ waza/            ← 上游 src/waza/*
│  │     │  ├─ tsume/           ← 上游 src/tsume/solver.ts
│  │     │  └─ records/         ← 上游 src/records/model|types|catalog|waza_steps
│  │     ├─ ai/                 AI 适配层（TS），与 public/games/shogi/engine/ 下的 worker 通信（§5.2）
│  │     ├─ ui/                 React：棋盘、持驹、弹窗、棋谱栏、演出、hooks（§4）
│  │     ├─ online/             React：大厅、匹配、房间连接 hooks（§6）
│  │     └─ server/             ← 上游 MatchRoom、Matchmaker、bot-result、disconnect、protocol、路由（都依赖将棋的类型或规则）
│  └─ online/                   真正与游戏无关的纯函数（不 import 任何游戏代码）
│     ├─ room-code、token、rate-limit
│     ├─ rating/                ← 上游 rating.ts 的纯计算部分
│     └─ name-filter、nickname/ ← 上游 name_filter、src/nickname/*
├─ public/games/shogi/engine/   ★原样分发的 GPL 组件（进 git，不经打包器）
│  ├─ ai-worker.js              上游未压缩源码，保留 SPDX 头
│  ├─ yaneuraou-worker.js       基于上游改写的 worker（修 §5.2 的坑，注明修改）
│  └─ yaneuraou/{sse42,nosimd}/yaneuraou.{js,wasm}
├─ third_party/yaneuraou/       GPL「对应源码」：mizar v7.6.3 的 source.tar.xz + Copying.txt，上游 yaneuraou_wasm_build/ 全部内容
├─ scripts/                     构建检查、诘将棋生成流水线（P4）
└─ test/                        vitest（core；`@cloudflare/vitest-plugin` 以 src/server.ts 为入口跑 Worker 与 DO）、Playwright E2E
```

### 2.3 为以后的游戏留的余地（只做「放对位置」，不做抽象）

- 只有**不 import 任何游戏代码**的纯函数放进 `src/online/`：房间码、token 签名、限流、评分计算、名字过滤、二つ名。这只是换个目录，不新增抽象。
- 其余服务端代码首发**全部放在 `src/games/shogi/server/`**，因为上游的依赖关系决定了它们离不开将棋：
  - `matchmaker.ts` 运行时直接创建将棋的 `MatchRoom`（`matchmaker.ts:14,265`）；
  - `bot_result.ts` 用将棋规则重放棋谱（`bot_result.ts:17`）；
  - `protocol.ts` 引用将棋的 `GameState/Move`（`protocol.ts:8`），`disconnect.ts` 引用将棋的 `Player`（`disconnect.ts:3`）。
- **首发不抽「通用房间 + 规则插件」接口。**
- 等**第二个联机游戏真正开工时**，再对照两个游戏的实际差异抽公共层。现在凭想象抽，大概率抽错。
- 游戏页面的公共外框（`src/site/`：页头、说明区、FAQ、广告位、JSON-LD 辅助）从一开始就共用，因为每个游戏页都一定要用。

### 2.4 为什么核心层用上游的数据结构

上游的 `GameState`（`board[y][x]`，`{type:"FU"|"+FU"…, owner:"sente"|"gote"}`，`capturedPieces`，`usiMoveHistory` 等）同时被服务端、`ai-worker.js`、棋谱、技判定、诘将棋求解器使用。前端直接采用它：

- 送给 AI、服务端时**零转换**；
- `applyMove()` 是不可变的（先深拷贝再改，返回新 state），直接可用于 React；
- **页面和服务端共用一份规则**：上游的页面和服务端各写了一份，我们合并。`ai-worker.js` 仍自带一份（原样使用，不改），所以整个系统里是**两份**规则。对策：**AI 返回的每一手都先用 `core/engine` 校验再落子**，不合法就降级重求（按 JS 超級）并上报 `app_error`；另外写一组两份规则的差异测试（随机局面下，比较两边的合法手集合）。

**对局的基准是 `{ initialSfen, moves }`，不是「永远从平手开始」。** 技図鑑的「この形でAIと練習」、棋谱查看模式里「从这里开始下」、将来的駒落ち，都会从非平手局面开局。上游的 yaneuraou worker 在有着法时总是发 `position startpos moves …`（`yaneuraou-worker.js:335`），从非平手局面走出第一手后，引擎分析的就是错误的局面。所以：

- 平手：`initialSfen = null`，发 `position startpos moves …`；
- 其他：一律发 `position sfen <initialSfen> moves …`；
- 棋谱、存档、分享 URL、复盘、战绩都以 `{initialSfen, moves}` 为基准。
- ⚠️ **移植工作量不小**：上游的 `replayUsiMoves` 总是从平手开始（`replay.ts:80`），USI 导入会直接拒绝非平手的 SFEN（`kif.ts:301`）。要让 `initialSfen` 贯穿解析、重放、KIF/USI 导出、短链接编码（扩展格式，带上初始局面）和测试。**这些都做完**，才能验收「从这里开始下」和「この形でAIと練習」。

---

## 3. 上游模块的取舍（A 路线）

| 上游 | 处理 | 备注 |
|---|---|---|
| `src/worker/shogi_engine.ts` | 移植 → `games/shogi/core/engine` | 补测试：二歩、打歩詰め、必成、千日手、連続王手 |
| `src/worker/*`（index/match_room/matchmaker/disconnect/token/room/protocol/rating/rating_store/bot_result/name_filter/env） | 移植：纯函数（房间码、token、限流、评分计算、名字过滤）→ `src/online/`；其余（MatchRoom、Matchmaker、bot-result、disconnect、protocol、路由）→ `games/shogi/server`（§2.3） | 改动见 §6.5。上游 `index.ts` 的路由改为由 `src/server.ts` 在交给 TanStack 之前调用 |
| `src/worker/backup.ts` + `migrations/0004` | **P3 只取 uid cookie 部分**；设置与战绩的完整备份推迟到 P6 | Safari ITP 数据保护 |
| `src/worker` 的 feedback + `0001/0002` | P5 移植 | Discord 通知改为可选 webhook（环境变量） |
| `src/kifu/*` | 移植 | `browser.ts` 的 IIFE 入口改为 ES module 导出 |
| `src/waza/*`、`records/catalog|waza_steps` | 移植 | 技演出的数据来源 |
| `src/nickname/*`、`name-filter` | 移植 → `src/online/` | 词表可以改成自己的 |
| `src/tsume/solver.ts` | 移植（P4） | 改为 module worker（Vite 的 `new Worker(new URL(…), {type:"module"})`） |
| `src/records/store.ts`（IndexedDB） | 移植 | DB 名、key 前缀改成自家的 |
| `scripts/tsume/*` + Actions | P4 移植 | 用它**自己生成题库**，不直接用上游的 `tsume_data` |
| `ai-worker.js` | 原样分发 | 11 档里的前 5 档 |
| `yaneuraou-worker.js` | 改写后分发 | 修坑，见 §5.2 |
| yaneuraou wasm/glue | 原样分发 | 与参考站 sha256 一致 |
| `shogi.js` / `online-match.js` / `shogi-tsume.js` / `index.html` / `style.css` / `build*.{sh,mjs}` / `service-worker.js` | **不用，按 React 重写** | 巨石 + 全局变量 + 直接操作 DOM |
| 图片（`images/koma/*.jpg`）、音效、品牌图标、OG 图、全部日文文案 | **不用** | 自己做（§8） |

---

## 4. 前端架构（React）

### 4.1 状态模型

- 对局 = `{ initialSfen: string | null（null=平手）, moves: Usi[], cursor: number }`，外加派生的 `states: GameState[]`（逐手缓存，悔棋和跳转都是 O(1)）。
- `useShogiGame(mode)`：reducer 负责走子、打入、悔棋/前进/跳转（在历史中间走子会截断后续）、重开 + 撤销；**不含 UI 状态**。
- `useLegalMoves(state)`：从 `core/engine` 派生可动棋子集合、落点集合、打入点集合，按 state 做 memo。
- `useAiOpponent`：见 §5.2。`useSettings` / `usePersistence` / `useRecords`：对应 localStorage 与 IndexedDB。
- 所有 localStorage 读写包 try/catch；key 统一加自家前缀（D2 定了再定）。

### 4.2 组件

`GameShell`（外框与布局）· `Board`（81 格 CSS grid，每格 memo）· `Hand`（持驹栏，横向溢出渐隐）· `PromoteSheet` · `KifuBar` · `ResultDialog` · `SettingsDialog` · `DifficultyPicker` · `WazaEffect` · `BoardNotice`（王手提示）· `MoveHint`（「为什么不能走」气泡）· `UndoToast` · `FirstMoveDemo` · `ShareSheet` · `KifuImportDialog`。

弹窗统一用 Radix Dialog（focus trap、Esc、焦点复位全部现成）。

### 4.3 布局与性能

- 棋盘最大宽约 480px，手机全宽；所有触控目标 ≥44px。
- 首屏只有静态 HTML + 棋盘；AI worker 在 `useEffect` 里创建；wasm 在 `load` 之后空闲时预取（§5.2）。
- 广告位固定预留高度（桌面约 280px，手机约 250px 全出血），广告脚本 `load` 后注入。**浮层会测量 fixed/sticky 广告带并避开**（上游 `screenBandHeight` 的做法）。
- 字体：选一种和风字体，只用于标题和棋子，正文用系统字体。字体用子集化、非阻塞加载。

---

## 5. AI 对战（首页）

### 5.1 难度：11 档，引擎文件与各档参数与参考站相同

> 措辞要准确：**同一套引擎文件 + 同样的深度 / 节点参数**，棋力相当。但我们修了 worker（入玉规则、`usinewgame`、请求串行化），所以**不保证与参考站逐手完全一致**，页面文案也不要这么写。

| 档 | id | 引擎 | 参数 | 解锁 |
|---|---|---|---|---|
| 入門 | novice | JS `ai-worker` | 深 1 / 500ms + 弱化表 + 随机抖动 | — |
| 初級 | easy | JS | 深 1 / 500ms + 弱化 | — |
| 中級（默认） | medium | JS | 深 2 / 700ms + 弱化 | — |
| 上級 | hard | JS | 深 3 / 1200ms | — |
| 超級 | super | JS | 深 5 / 3000ms | — |
| 達人級 | master | やねうら王 | `go nodes 5000` | — |
| 偉人級 | great | やねうら王 | 10,000 | — |
| 超越級 | transcendent | やねうら王 | 30,000 | — |
| 伝説1 | legendary1 | やねうら王 | 90,000 | 胜 超越級 |
| 伝説2 | legendary2 | やねうら王 | 300,000 | 胜 伝説1 |
| 伝説3 | legendary3 | やねうら王 | 1,000,000 | 胜 伝説2 |

- 未解锁的档只露出「下一档」，显示为 disabled 并注明「〇〇に勝利して解放」，更后面的档隐藏。
- 定跡（2 条，只在 JS 档生效）的状态由主线程保管并随请求往返，照上游做法。
- やねうら王 出错时自动降级为 JS 超級，与上游一致。

### 5.2 AI 适配层 `src/games/shogi/ai/`

接口（报告 B §5.3）：`prefetch() / warmup(level) / newGame() / requestMove(req) → Promise<AiResult> / cancel() / dispose()`。`AiResult` 分三种：`move`、`resign`、`win`（入玉宣言单独成类，不和 `resign` 混在一起）。

**自写的 `yaneuraou-worker.js` 必须修掉上游的四个问题：**

1. **`setoption USI_Hash 16`**：默认值 1024MB 在 wasm32 分配失败，引擎会卡死（已实测）。
2. **请求串行化**：上游只有一个 `pendingResolve`（`yaneuraou-worker.js:204,343`），旧局面的 `bestmove` 可能被当作新请求的结果送回。USI 的输出不带任何 ID，所以光给结果贴 requestId 不够，要写成明确的状态机：
   - 状态：`idle → searching(reqId) → idle`。**同一时刻最多只有一条 `go` 在执行**；
   - 搜索中来了新请求：排队，只保留最新的一条（旧的排队请求直接作废）；
   - 取消：只把当前 reqId 标为作废。引擎回来的 `bestmove` 照常**消费掉并丢弃**，然后才发下一条 `go`；
   - 急停（伝説3 在慢机上要数秒、或 watchdog 超时）：`terminate()` 后重建 worker，重新 init。
   - 测试用例：重开后立即请求、搜索中切换难度、悔棋后立即请求、超时 terminate 后重建。
3. **入玉宣言**：设 `EnteringKingRule NoEnteringKing`，引擎就不会回 `bestmove win`（我们的规则引擎首发不实现入玉宣言）。万一收到仍单独处理，不能当作 AI 被将死（上游把它和 `resign` 混在一起，胜负判反了）。
4. 每局开始发 `usinewgame`，清掉上一局残留的置换表。
5. 非平手开局发 `position sfen <initialSfen> moves …`（见 §2.3）。

发给引擎的 `go nodes N` 与上游一致。

**其他要求：**

- 两个 worker 都是 classic worker，用字符串 URL 创建（`new Worker("/games/shogi/engine/ai-worker.js")`），**不经 Vite 打包**（放在 `public/`，原样输出，SPDX 头得以保留）。
- **加载时机**：SIMD 检测后只取 sse42 或 nosimd 其中一份（不能两份都下）。`load` 之后 `requestIdleCallback`（timeout 3s）：当前档是やねうら王就 init，否则只 prefetch。
- **无法中途停止搜索**：取消只丢弃结果（requestId 守卫）；需要立刻停时 terminate 后重建 worker。
- **最短思考 600ms**，免得 AI 秒下显得像瞬移。「思考中」指示在执后手时翻到下方。
- 响应头：`/games/shogi/engine/yaneuraou/*` 设 `Content-Type: application/wasm` 和 `Cache-Control: immutable`（写在 `public/_headers`）。路径带版本号。
- CSP 若启用，需要 `worker-src 'self'` 和 `'wasm-unsafe-eval'`。

### 5.3 从参考站吸收的对局 UX（按价值排序；哪些进 M1 见 §9）

1. **重开不弹确认框，改为可撤销**：已走 ≥3 手时点「新規対局」，顶部出现「対局をリセットしました［元に戻す］」，停留 10 秒；自己走第一手即消失。撤销恢复棋谱、难度、先后手。对局中换难度、换先后手也走同一机制。
2. **先后手延迟生效**：对局中改先后手时，设置里只显示警告「…N手目はリセットされます」，关闭设置弹窗时才生效。
3. **每手自动存档，刷新原样续玩**：只存 USI 着法数组和 cursor；恢复时如果轮到 AI 走，AI 接着思考。
4. **「为什么不能走」气泡**：覆盖四种情况——正被将军、该子被钉住、目标格会被吃掉王、打入解不了将。同时标红相关格，被拒的格子抖一下。4 秒后自动消失，设置里可关。
5. **王手提示分两层**：一是顶部浮层（不插入文档流，避开广告带），攻方和守方用不同样式；二是盘面上给攻子和玉加红框，远程将军画一条 SVG 线，2.4 秒后淡出。
6. **能动的棋子提前高亮**：可落点整格高亮。非法着（二歩、打ち歩詰め、行き所のない駒、王手放置）根本不出现在候选里。
7. **点选与拖拽共存**：Pointer Events 实现。拖动超过阈值才开始拖拽（鼠标 5px / 触摸 8px）；拖拽后吞掉紧随的 click；pointercancel 或窗口失焦时取消。`touch-action:none` 只加在可拖的格子上，不影响页面滚动。
8. **新手演示**：虚拟手指演示「７七歩 → ７六」，最多播 2 次。触发条件三种：空闲 6 秒、新局开始 1 秒、点了不能动的东西 0.5 秒。开启减弱动效、执后手、棋盘不在视口内时都不播。
9. **手筋・囲い演出**（依赖移植的 `core/waza`）：
   - 表现：cut-in 横幅、盘面标记、一张「札」卡（一句解说，**解说文案自己写**）。
   - 生涯第一次打出时显示「はじめて出した技です」。
   - 强度四档：派手 / 標準 / 控えめ / なし。
   - 点屏幕任意处即关闭。开启减弱动效时只做淡入淡出。
10. **终局弹窗**（从上到下）：
    - 顶部色条按胜 / 负 / 和变色；
    - 「N手で決着」；
    - 成绩条：決まり方 / レベル / 通算勝利；
    - 本局打出的技（可点进技図鑑）；
    - 终局盘面缩略图（点击关闭弹窗，回到真盘）；
    - 分享；
    - 主按钮「次のゲームへ」，本局解锁新档时变为「次のレベルへ」；
    - 右上 ✕ 关闭后自动展开棋谱栏，方便复盘。
11. **悔棋语义**：＜ ＞ 每按一次只退/进 1 手。停在 AI 回合的历史局面时 AI 不自动走，点棋盘给出提示。终局后也能悔棋继续下。
12. **棋谱栏**：折叠态显示「N手目: ▲７六歩 [技] 手番」，展开为着法列表，点任一手跳到该局面。另含「共有・出力」（复制 URL、X、LINE、KIF 复制/下载）和「読み込み」（粘贴 KIF 或 USI 即时识别，出错时指出第几手）。
13. **棋谱短链接** `/?k=…&m=N`（上游编码，约 2.7 字符/手）：打开后进入查看模式，在任意局面动子即从该局面开局，可选「AI と対戦 / 自分で両方」。
14. **战绩**（IndexedDB）+ `/records/` 页面（noindex）：每局可在新标签打开复盘。保存失败时显示看得见的「再試行」。
15. **首手有声**：驹音在 head 里预加载，否则第一手常常没声音。
16. **PWA 安装提示时机克制**：只在终局弹窗中出现；iOS 改为弹出图文步骤；关闭后 7 天内不再出现（P5）。
17. **「診断情報をコピー」按钮**（菜单里）：复制当前 SFEN、最近几手、AI 档位与引擎状态（sse42/nosimd、是否已降级）、最近的 JS 错误、视口和 UA。新站初期联机和 wasm 的问题很难复现，用户贴过来就能查。参考站把这些自动附在反馈表单里，我们首发先做复制，反馈入库放到后面。

### 5.4 超过参考站的改进（首发做 ★，其余进 backlog）

- ★ **成り选择贴在落点旁**：带遮罩，直接显示成 / 不成两个驹面（参考站这里最弱：居中白框、无遮罩）。
- ★ **棋子滑动动画**（约 120ms，减弱动效时关闭）。
- ★ **AI 模式加「投了」按钮**，投了计入战绩。
- ★ **手动翻转棋盘**；将棋盘模式可选「每手自动翻转」。
- ★ **键盘走子 + 每格 aria-label**（如「７六 歩 先手」）；← → 键悔棋 / 前进。
- 振动反馈（设置里可关）；联机对局中申请 Wake Lock 防息屏。
- 入玉宣言（27点法）/ 持将棋、最大手数和棋：规则引擎和 AI 设置要一起改。
- 对局后「検討」：利用やねうら王的 `info score` 显示评价值和最佳着（首发不做）。

---

## 6. 联机对战（Cloudflare DO）

### 6.1 服务端：移植上游 `src/worker`，保留其已被实战验证的设计

| 项 | 值（上游实测参数，照搬） |
|---|---|
| 房间 | 每房一个 `MatchRoom` DO，SQLite 单行表；Hibernation WS，`setWebSocketAutoResponse("ping","pong")`（ping 不唤醒 DO、不计费） |
| 房间码 / token | 10 位，字母表 32 字符（去掉 I/O/0/1）；token = `base64url(JSON{roomCode,side,uid,exp}).HMAC-SHA256`，有效期 24h；密钥 `TOKEN_SECRET` 放在 secret |
| 在线判定 | `max(WS 打开时刻, 最近一次 auto-response 时间, last_seen)` 在 25s 内即算在线；**带 token 的 HTTP 轮询也算存活** |
| 掉线 | 宽限 60s；静默 15s 后才给对方显示倒计时；双方都超时判和 |
| 时钟 | 服务端权威。第二人入座后延迟 5s 起表；过了截止时间 1s 内到达的着法仍有效；DO alarm 至少每 60s 醒一次兜底 |
| 时限 | 友达局：无限制 / 切れ負け 3・5・10分 / 1手 10・30・60秒；随机匹配固定 1手30秒 |
| 写入 | `expectedRevision` 必须等于当前 revision，否则返回 `revision_conflict` 加当前 match；非法着返回 `illegal_move`；终局后再提交着法幂等返回终局状态 |
| 千日手 | 同一局面出现 4 次判和；其间一方始终在王手则判「連続王手の千日手」，王手方负 |
| Matchmaker | 全局单例 DO，队列就是 hibernatable WS 集合本身。允许分差 = 200 + 25×等待秒数，30 秒后不限；**按两人中等得更久的一方计算**；每 5 秒重试配对；同 uid 重复排队时旧连接 close 4000 |
| 评分 | 内部 Elo（起点 1000，K=32）；显示值 = 1500 + 2.3 / 1.4 非对称倍率 × 差值，下限 1400。級每档 100 分、段每档 150 分（初段 2000 … 六段 2750），只升不降。另有：输给弱者时超出部分压缩；低分段输棋少扣；同一对手同日连战衰减；COM 局 ×0.5 |
| COM 局 | ticket = `{jti, uid, exp: 2h}`；赢棋必须附棋谱，服务端重放确认以将死结束；≥12 手；每天最多 20 局；到初段以上不再计分；D1 `rated_game` 主键防重复结算 |

### 6.2 「匹配不到人就和 COM 下」（用户重点需求）

- **开关**：设置里「だれかと対戦で相手がいないとき：コンピュータと対局する」，默认开。**大厅 CTA 下方也放一个同样的开关**（参考站只放在设置里，太难找），两处同步。
- **等待时长由服务端决定**：环境变量 `BOT_FALLBACK_SECONDS`（默认 30，见 D4）。`queued` 消息里带上 `botAt`，客户端据此倒计时，不再像上游那样在客户端写死 60。细节：
  - `botAt` 按**服务器记录的入队时刻**计算，用服务器时间表示，客户端按时钟偏差换算；
  - 断线重连会重新入队，服务端重新发新的 `botAt`；
  - 倒计时走到 0 **只显示「まもなく…」，仍然等服务端的 `bot` 消息**，客户端不自行开 COM 局（配对和 COM 兜底只能由服务端裁决）；
  - 开关关掉时改为正计时，10 分钟后返回 `queue_timeout`。
- **搜索卡片**：「対戦相手を探しています」+ 倒计时 +「最長N秒で始まります」+ 取消按钮。等待期间可以做诘将棋（P4 上线后接入）。
- **诚实标注**：切到 COM 时明确提示「相手が見つからなかったので COM と対局します」，对手名显示 COM，FAQ 里写明规则。不伪装成真人。
- **COM 局在浏览器本地跑**（服务器零 CPU）：强度取玩家在 AI 对战里选的档，やねうら王档一律降为超級（与上游一致）；一手 30 秒，第一手额外 +5 秒；COM 每手至少等 700ms。
- **结果上报**：`POST /api/bot-result`，按 §6.1 的规则计分；计分时弹段位卡。之后按钮「もう一度対戦する」重新排队。
- **「输了就关页面不扣分」的漏洞：首发不处理**（已评估并放弃 `/api/bot-start` 方案）。COM 局本来就是客户端自报：服务端只能验证「赢棋的棋谱以将死结束」，证明不了对手真是 COM，负局与和局也全靠自报。加一个 start 接口，客户端照样可以不发、伪造时点，网络中断的用户还会被误扣分。要真正堵住，得把 COM 局的会话和着法都放到服务端管理，等于重做 COM 对局。
  - 现有的三道限制已经够用：COM 局计分减半、每天 20 局上限、到初段就封顶。
  - 文案上把 COM 局的分数说成「轻量的进度」，不当作严肃的实力证明。

### 6.3 客户端（按上游协议用 React hooks 重写）

- `useRoomConnection`：
  - WS 连接超时 5s；ping 5s，12s 收不到 pong 就重连；退避从 1s 翻倍到 15s。
  - 连续失败 2 次后改为每 3s 轮询 `/state`。
  - 走子乐观更新：WS 发出后等 ack 2s，超时改走 HTTP `/move`。靠 `expectedRevision` 保证幂等，冲突时回滚快照并应用服务端给的状态。
  - 用 `roomEpoch` 丢弃过期回调；页面回到前台立即重连；按 `server_now` 计算时钟偏差。
- `useMatchmaking`：lobby → seeking → found（1.5s 后直接用 token 连房间 WS，15s 内等不到 state 判失败）→ game；收到 bot 消息就开本地 COM 局。
- **友达对战**：
  - 点「招待URLをコピー」或「QR」时才建房间，URL 挂 `?room=CODE`；join 对同一 uid 幂等，刷新后能回到原座位。
  - 复制要在用户手势内完成（ClipboardItem → writeText → 失败则弹 QR）。
  - 手机优先用 **Web Share API**（系统分享面板，LINE 直达）；QR 库懒加载。
  - 可设先后手（先手 / 後手 / ランダム）和时限，开局前可改。
- **对局内**：开局遮罩「対戦開始 / あなたは先手です」+ 入室音。计时每 250ms 刷新：剩余不多时变色，快到时屏幕四角泛红。读秒语音三档（しっかり / 控えめ / なし），用日语 TTS，没有时退回蜂鸣。掉线时在对应一方的栏上显示倒计时。投了要确认。对局中离开页面，确认后先投了再跳转。
- **身份**：uid = `crypto.randomUUID()` 存 localStorage。**同时由服务端下发 `__Host-` cookie 保存 uid**（上游在 `/online-stats` 响应里 Set-Cookie）。
  - 原因：Safari ITP 会清掉脚本写入的存储，但服务端下发的 cookie 能活下来。localStorage 丢了就从 cookie 找回 uid，段位（存在 D1）就不会丢。
  - 这一最小版本放在 P3 首发；设置与战绩的完整备份放 P6。
- **名字**：三种（`PlayerNNNN` 默认名 / 二つ名生成器 / 半角英数 10 字）；名字过滤前后端用同一份代码；敬称规则（纯 ASCII 名字加半角空格再加「さん」）照上游。
- **随机匹配的解锁门槛**（纯客户端，只是新手引导）：「赢一局 AI」（入門档就能赢）或「赢下教程」（P2 已实现：本地 COM 自适应放水，只会越来越弱，照上游逻辑）；P4 之后再加「解一道诘将棋」。
- **段位卡**：
  - 大厅显示段位徽章、实力值、进度条、「〇〇まで あと N」；
  - 终局弹窗显示分数变化，从旧分滚动到新分；
  - 升段时有动画（减弱动效时跳过）；
  - 「段級位を表示しない」开关：对双方都生效。

### 6.4 协议

沿用上游的 HTTP 和 WS 契约（报告 C §1 + E §2.3），类型定义放在 `src/online/protocol`（通用部分）和 `games/shogi/online`（将棋的 Move/State），前后端共用。

### 6.5 相对上游的服务端改动

1. **广播瘦身**：区分两种类型——
   - 内部 `GameState`：DO 里仍存完整历史，`applyMove` 和千日手判定要用（`match_room.ts:910`，`shogi_engine.ts:930`）；
   - 对外 `PublicGameState`：去掉 `positionHistory/checkHistory/turnHistory`（100 手局单条可达数十 KB）。
   - 上游客户端本来就只读下发的棋盘字段和 `usiMoveHistory`（`shogi.js:2184`），所以瘦身原则上是安全的。
   - 客户端在首次进入、刷新、revision 冲突回滚时，用 `usiMoveHistory` 从初始局面重放，**再把重放出的盘面与服务端下发的盘面比对**；不一致就上报错误，并以服务端为准。
2. **限流**：进程内 Map 改为 **Cloudflare Rate Limiting binding**。
   - 这个 binding 按数据中心计数、最终一致，只适合做**粗限流**。ticket 防重复（D1 主键）和每日 20 局（查 D1）仍按数据库检查，不能交给它。
   - 按端点分别设阈值。学校等场景同一 IP 下会有很多人（上游因此特意放宽了阈值）。
   - `move/state/ws` 只防刷量，阈值宽到不会误伤正常的重连和 3 秒轮询。
3. `BOT_FALLBACK_SECONDS` 可配，`queued` 消息带 `botAt`（§6.2）。上游代码注释和测试里「一人每 60 秒一张 ticket」的前提要同步改。
4. **`/online-stats` 只缓存「不带 uid」的请求**（只有在线人数，无个人数据，无 Set-Cookie），在 Worker 里用 Cache API 缓存 5 秒。**带 uid 的请求**（含个人段位，并会下发身份 cookie）**一律绕过缓存**。Cache API 只在当前数据中心生效，所以这是「减负」，不是全局缓存。
5. 配置与密钥分开管理（仓库是公开的）：
   - **非密钥配置**（域名、cookie 名、`BOT_FALLBACK_SECONDS`、D1 的 `database_id`）写在 `wrangler.jsonc` 或 `vars` 里，可以公开。`database_id` 只是绑定用的标识，不是密钥。
   - **密钥**（`TOKEN_SECRET`、webhook URL、Cloudflare 部署 API token）只放在 Worker secrets（`wrangler secret put`）和 GitHub Actions secrets 里。**绝不进 Git、`vars` 或 `VITE_` 变量**。部署 token 只给最小权限。
   - P0 写好 `.gitignore`（`.dev.vars*`、`.env*`）；CI 里加一步密钥扫描，发布前也扫一遍仓库。
6. 设置与战绩的完整备份 / 恢复放 P6（uid cookie 的最小版本在 P3，见 §6.3）。
7. **友达局「もう一度」简化做**：终局后按钮「同じ設定でもう一局」，用同样设置（先后手互换）建一个新房间，弹出新的邀请链接或系统分享面板，对方点开即入座。**不做**房间内的 rematch 协商和双方自动迁移：座位、token、过期、重连都有状态约束，投入偏大，等有实际需求再说。

### 6.6 运维与成本

- 计费口径（上线用 Workers Paid，见下）：静态资源请求不计费；DO 请求按量计费（付费档含一定免费额度，超出部分按百万次计价，以官方价格页为准）；WS 入站消息按 20:1 折算。**但 DO 的 alarm 和 RPC 调用也计请求**：
  - 排队中的 Matchmaker 每 5 秒一次 alarm；
  - 对局中的房间至少每 60 秒一次 alarm，外加超时和掉线相关的 alarm；
  - WS 被拦的用户每 3 秒一次 HTTP 轮询。
  - 所以**首发前要做一个负载模型**（等待时长 × 对局时长 × alarm × 后备路径），用压测脚本核对。先算出「每日 X 局时每月大约多少钱」，不要凭感觉。
- **页面请求**：预渲染的页面走静态资源，不计费。按请求 SSR 的页面（诘将棋、sitemap 等）在缓存没命中时算一次 Worker 请求；用了前置缓存则命中时不算（§2.1）。所以默认预渲染，只把真需要动态的页面做 SSR。
- ⚠️ **CPU 时间才是免费档的硬限制**：Workers Free 的普通请求上限是 **10ms CPU**，Cloudflare 自己说 SSR 这类请求通常要 10–20ms。上游 `bot-result` 最多接受 600 手并在普通 Worker 里重放，注释写着 120 手重放就要约 11ms（`bot_result.ts:43,125`）。DO 不受这个限制（单次调用默认 30 秒 CPU）。
  - **结论：上线即用 Workers Paid（$5/月，普通请求默认 30 秒 CPU）**，免费档只用于开发和预览。
  - P0 仍要在线上实测 SSR 页面的 CPU；P3 实测 600 手棋谱的 `bot-result`。都要在日志里留意 `exceededCpu`。
- 日志采样率设 0.1。
- CI（GitHub Actions）：`tsc` → `vitest`（core + Worker/DO 测试）→ `vite build`（含预渲染）→ 构建产物检查（SSR 路由没有被预渲染、`_headers` 在产物里、没有密钥）→ `wrangler deploy`。**测试不过不部署**（上游 CI 不跑测试）。

---

## 7. 其余页面与内容（SEO）

**首发必须有（P5a，与联机一起上线）：**

- `/`、`/board`、`/online` 各自有独立 title 和 description（字数按 §9.5-3 的文案规范），**H1 带关键词**（参考站三页的 H1 都只是品牌名）。模式切换 tab 用真 `<a>` 链接。
- 每页正文 1,500〜3,000 字原创说明 + FAQ，全部基于本站实际行为书写（难度档数、禁手处理、掉线 60 秒、自动存档等）。
- 法务页：プライバシーポリシー（按電気通信事業法列出外部发送：Plausible / AdSense）、利用規約、運営者情報、お問い合わせ。**「ライセンス / ソースコード」页**：列出 GPL 组件、上游致谢、源码链接。
- 结构化数据：首页用 `WebSite` + `Organization`；各页用 `BreadcrumbList` + `WebApplication`（`offers.price: 0`）。**不输出 aggregateRating**。
- `sitemap.xml` 用 server route 生成，带 lastmod。日期来自内容常量（文案改了在同一提交里改日期）或题库的出题日，**不用 `new Date()`**。`robots.txt` 屏蔽 `/api/`；战绩页 noindex。
- 每页一张独立 OG 图，加 `og:locale ja_JP`。

**P4 诘将棋：**

- 移植上游生成流水线：やねうら王自对局 + KomoringHeights 验证，**自己生成题库**。每天 7 题。题库和出题日程**提前生成好随代码部署**（一次备几个月），`/tsume/` 按请求 SSR（**从预渲染里排除**），按 JST 日期取当天的题，边缘缓存到 JST 零点（机制见 §2.1）。验收要跨 JST 零点测一次，确认换成了新题。**不需要每天重建部署**（上游因为是纯静态站才每天部署）；只在补充题库时由 Actions 部署一次。
- `/tsume/` 显示当天题目，canonical 指向自己。回看的题用稳定的日期 URL（如 `/tsume/2026-10-01/`），各自 canonical 指向自己。按手数分的专题页（`/tsume/1te/` 等）是另一类页面，不与每日页互指 canonical。
- 功能：提示、答案播放、连续天数、Wordle 式分享。
- 接入联机匹配的等待时间（`challenge.json`，1/3/5 手难度自适应）。

**P5b 技図鑑与入门内容（持续产出）：**

- 先做参考站已有的 26 个主题；每篇 1,200〜2,500 字，比参考站的 450〜1,050 字更厚。
- 文章页构建时预渲染；盘面图输出成 HTML/SVG 棋盘，加分步控件，不开 JS 也能看到完成形。
- **「この形でAIと練習」**：用该形的局面直接在首页开局（`/?waza=<id>`，canonical 仍指向 `/`）。这是相对参考站的核心差异化。
- 对局中识别出技 → 终局弹窗链到对应文章 → 文章里显示「あなたの記録 N回」，形成闭环。
- 之后扩充：参考站没有的囲い / 戦法 / 手筋、规则入门、各棋子走法、反則一覧、棋譜の読み方、詰みの基本形、用語集、駒落ち。

**P5c PWA**：手写 SW（同上游策略）：页面 network-first；带 hash 的资源 cache-first；wasm 不预缓存，首次加载后才进缓存；空闲时注册。

---

## 8. 必须自己做、不能搬的东西

- 品牌名、logo、配色基调（可同为和风，但不能一眼像参考站）；OG 图、PWA 图标。
- 棋子：CSS 或 SVG 自绘。「動かし方表示」模式用自绘的方向点，不用上游的 `koma/*.jpg`。
- 音效：自己录或用明确可商用的素材；上游音效的来源不明，不要用。
- 全部日文文案，包括技的一句解说、FAQ、错误提示。**错误提示可以参照上游的语义，但措辞重写。**
- 诘将棋题库（自己生成）。
- 二つ名词表：建议重写，保留生成机制。

---

## 9. 阶段与工期（单人 + Claude，工作日估算）

M1 的验收**只盯四件事**：完整的 AI 对局、友达对战、随机匹配加 COM 兜底、基础内容。技演出、教程、复杂动画都放到 M1 之后。

| 阶段 | 内容 | 估算 | 完成标准 |
|---|---|---|---|
| P0 基盘 | 官方命令起 TanStack Start + Cloudflare 项目；LICENSE / NOTICE / `third_party` 对应源码；水匠权重许可核实；`.gitignore` 与密钥规则；`src/server.ts` 导出一个空 DO 并接两条 WS 路由；预渲染一个页面、SSR 一个页面（并从预渲染中排除）；边缘缓存机制核实；`public/_headers` 生效；`games/shogi/core/engine` 移植 + 测试；`public/games/shogi/engine` 就位；CI 骨架（含产物检查、密钥扫描） | 3–4 | `vite dev` 单端口下：SSR 页面、预渲染页面、D1、DO、WebSocket 全部可用；部署到 workers.dev 后同样可用；wasm 响应头正确；带参数深链接无水合错误；SSR 页面的线上 CPU 已实测；engine 测试通过 |
| P1 AI 对战 | §5.1–5.2；§5.3 的 1–8、10–13、15、17；§5.4 的 ★；设置；自动存档；`{initialSfen, moves}` 基准（贯穿棋谱解析、重放、导出、短链接） | 9–11 | 11 档都能下完整局；刷新续玩；悔棋 / 重开可撤销；やねうら王失败自动降级；AI 着法都经规则校验；手机实机可玩 |
| P3 联机 | §6 全部（除 P2 的教程）：服务端移植与改造、友达对战与「同設定でもう一局」、随机匹配、COM 兜底、段位、uid cookie、负载模型 | 8–11 | 双浏览器 E2E 通过（清单见 §10）；DO 测试全部通过；负载模型得出「每日 X 局时每月费用」的估算；600 手棋谱的 `bot-result` 线上 CPU 已实测 |
| P5a 首发内容 | 三页正文 + FAQ、法务页 + 许可证 / 源码页、sitemap / robots / OG / JSON-LD、Plausible、广告位 | 3–4（文案另计） | — |
| **M1 上线** | P0 + P1 + P3 + P5a | **约 23–30** | — |
| P2 补全 | 技演出（§5.3-9）、教程与解锁条件、`/board/`、战绩 + `/records/`、棋谱导入（§5.3-12 的「読み込み」）。PWA 安装提示移到 P5c（要用品牌图标） | 6–8 | — |
| P4 诘将棋 | 流水线、`/tsume/`、等待时间里的诘将棋 | 5–7 | — |
| P5b / P5c | 技図鑑、入门内容、PWA（SW） | 持续 | — |
| P6 | 设置与战绩完整备份、反馈入库、入玉宣言、検討 | 按需 | — |

> 估算以「上游可直接移植」为前提，且没算文案写作。上游测试类别很多（报告 E §1.5），移植测试本身也要时间；估算偏乐观的话，优先砍 P1 的次要 UX（新手演示、滑动动画），不砍规则和联机的正确性。
>
> 选 B 路线时：P0 +3（自写规则引擎与测试），P2 +3（技判定），P3 +5（服务端全部自写），P4 +3（求解器），合计多约 14 个工作日。

---

## 9.1 P0 进度（2026-09-27）

**本地已完成并验证：**
- 官方命令起的 TanStack Start + `@cloudflare/vite-plugin` 项目；LICENSE、NOTICE、`third_party/yaneuraou/`（mizar 源码包 + 上游构建脚本，wasm 的 sha256 与参考站一致）。
- `src/server.ts`（导出 DO、联机路由优先、默认 `no-store`）+ `src/api.ts`（`/api/health`、两条 WS 路由、JSON 404）。房间 WS 在 Worker 里验 token（`src/online/token.ts`，移植自上游）。
- DO 为占位实现，类名用最终名字（`MatchRoom` / `Matchmaker`），P3 替换实现时不需要改名迁移。
- `/`、`/board` 预渲染为 `index.html` / `board.html`；`/tsume` 按请求 SSR，已从预渲染中排除，由 `scripts/check-build.mjs` 断言。
- `public/_headers`：`yaneuraou-v7.63/*` 为 `immutable`，wasm 响应为 `application/wasm`。
- 规则引擎移植到 `src/games/shogi/core/engine`，上游 16 个测试全部通过。
- 测试：vitest 两个项目。`core` 跑在 Node；`worker` 用 `@cloudflare/vitest-plugin`，在 workerd 里经过 Worker 入口测路由、WS、DO。测试入口是 `test/worker-entry.ts`，因为 `src/server.ts` 引用的 TanStack 虚拟模块在 vitest 里解析不了；被测的路由与 DO 是同一份代码。
- `vite dev`（3160）下 SSR、D1、DO、两条 WS（含 ping/pong 自动应答）均可用；`vite preview`（3161）下带参数深链接无水合错误。
- CI 骨架：gitleaks → typecheck → test → build（含检查）→ 仅 main 分支部署。

**codex 对 P0 代码的 review（已修）：**
- CI 的 gitleaks 升到 v3（v2 依赖的 Node 20 已从 GitHub runner 移除）；部署 job 在设了仓库变量 `DEPLOY_ENABLED=true` 之后才运行（D1 的 `database_id` 首次部署时才有）。
- Worker 转发给 DO 前，删除客户端发来的所有 `x-match-*` / `x-mm-*` 头，只加回验证过的值。P3 接入上游 Matchmaker 时它信任 `x-mm-uid` 等头，所以现在就堵上，并已加伪造头测试。
- `check-build` 扫描整个 `dist`（本地预览用的 `dist/server/.dev.vars` 副本除外），并能解析带引号的值；CI 上传产物时排除这个文件。已用植入泄漏的方式验证能拦住。
- `/tsume` 的日期和缓存 TTL 用同一个时刻计算，跨零点渲染时不会把昨天的页面缓存一整天。
- 默认 `no-store` 的包装抽成 `src/cache-policy.ts`，测试入口也经过它，并有对应测试。
- wasm 对应源码补上上游 Dockerfile 会克隆的 usumerican 仓库（固定到提交 `4568f76`）。核实结果：它的文件都被上游的补丁版覆盖，不进入最终产物，但为了能离线重建仍然镜像。离线重建并比对 sha256 尚未执行。
- 未采纳：在 `_headers` 里显式写 wasm 的 `Content-Type`。静态资源服务已按扩展名返回 `application/wasm`（本地实测），多写一条没有收益。

**线上验收（2026-09-27，https://shogi.wsyl1329.workers.dev ，D1 `shogi` 在 APAC）：**
- `/`、`/board` 作为静态资源返回；`/board/` 307 到 `/board`。
- `/tsume` 按请求渲染，**边缘缓存命中**：连续请求 `cf-cache-status: HIT`，`nowMs` 相同、`age` 递增，说明 Worker 没有再运行。
- `/api/*` 为 `BYPASS` + `no-store`；wasm 为 `application/wasm` + `immutable`。
- 两条 WebSocket 在线上可用：匹配 WS 收到 `queued`（`botAt` ≈ 30 秒后）、ping/pong 自动应答；房间 WS 用有效 token 能连上并按座位回显，伪造 token 被拒。
- **CPU 实测**（`wrangler tail`）：`/tsume` 的 SSR 冷启动 23–30 ms、热 3–4 ms；`/api/health` 约 0–1 ms（墙钟约 250 ms，是 D1 的网络延迟）。冷启动超过免费档 10 ms 的上限，**上线前必须切到 Workers Paid**（§6.6）。
- `TOKEN_SECRET` 已通过 `wrangler secret put` 设置（验收时轮换过一次，值从未落盘或打印）。

**仍待处理：**
- 账号切到 Workers Paid（上线前）。
- 水匠权重的许可：仍无明确条款（见 §1.3-5 与 NOTICE.md），上线前再确认。
- wasm 离线重建并比对 sha256（§1.3-4）。
- CI 部署：配置 GitHub 仓库后，设置 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets 和 `DEPLOY_ENABLED=true` 变量。

## 9.2 P1 进度（2026-09-27）

**已实现（AI 对战首页）：**
- 核心逻辑：
  - `core/kifu/`：上游棋谱模块移植，`initialSfen` 贯穿 SFEN、重放、记谱、KIF/USI 读写（含 BOD 局面图）和分享链接（v2 格式带初始局面；平手仍用 v1，链接很短）；
  - `core/record.ts`：`{initialSfen, moves, cursor}`、截断分支、投了、终局；
  - `core/hints.ts`：升变规则、攻击方、「为什么不能走」的理由（我们自己写的）。
- AI：
  - 11 档难度与解锁（`ai/levels.ts`）；
  - 自写 `yaneuraou-worker.js`：状态机保证同一时刻只有一条 `go`，设了 `USI_Hash 16` 和 `NoEnteringKing`，每局发 `usinewgame`，非平手开局发 `position sfen`；
  - 适配层：每一手都用核心引擎校验，非法、超时或出错时降级到 JS 超級。
- UI（`games/shogi/ui/`）：§5.3 的 1–8、10–13、15、17，§5.4 的全部 ★（升变面板贴在落点旁、滑动动画、投了、手动翻转、键盘走子 + 每格 aria-label + ← → 前后）。另有：
  - 设置（先后手延迟到关闭时生效）、自动存档与恢复；
  - 分享链接的棋谱查看模式（在任意局面动子就从那里开始对 AI）；
  - 驹音用 WebAudio 合成（没有音频文件，也就没有许可问题）；
  - 驹字体只加载棋子用到的字形子集。
- AI 答复的防串：每个请求带「局面指纹 + 代数」，重开、悔棋、换档后迟到的答复一律丢弃。
- 胜场与解锁按对局 ID 去重：退回获胜前一手再赢一次不会重复计数。

**验证：**
- `pnpm test` 204 个全部通过；`node scripts/engine-smoke.mjs` 全部通过（真 wasm：伝説3 在 sse42 下约 1 秒、nosimd 约 4.3 秒）。
- 无头浏览器实测：
  - 走子与 AI 应手、存档恢复、升变面板、钉住的解释；
  - 浏览器里跑 やねうら王（sse42，100 万节点 0.7 秒）；
  - 重置后「元に戻す」、投了弹窗、分享链接往返与分支；
  - 新手演示、拖拽、王手提示与连线、纯键盘走子、执后手时的棋盘朝向。
- 首页 JS 约 135KB（gzip）：React + TanStack 约 103KB，游戏代码约 24KB。
- 自我 review 与 codex review 各一轮。codex 的 BLOCKER（迟到的 AI 答复落到新对局）及 6 条 WARN 已全部修复；「棋盘格触控区 < 44px」是 9 路棋盘在手机宽度下的物理限制，改为把持驹按钮提到 44px。

**未做（按计划在后续阶段）：** 棋谱导入（P2）、技演出（P2）、战绩页（P2）、`/board`（P2）、正文与 SEO（P5a）、真机测试（iPhone Safari / Android）。

## 9.3 P3 进度（2026-09-27）

**服务端**（移植上游 `src/worker`，放在 `games/shogi/server/` 与 `src/online/`）：
- MatchRoom / Matchmaker 两个 DO、掉线判定、COM 局结算、D1 评分（`migrations/0001_player_rating.sql`）。
- 相对上游的改动：
  - 下发 `PublicGameState`，去掉三个历史数组；
  - COM 兜底等待时间读 `BOT_FALLBACK_SECONDS=30`：`queued` 带 `botAt` 和 `server_now`，alarm 定在最早的 `botAt`；
  - 限流改用 Cloudflare Rate Limiting 绑定，按 IP 粗限流，没配绑定则放行；
  - `/online-stats`：不带 uid 时边缘缓存 5 秒，并带上 `botFallbackSeconds`；带 uid 时 `no-store`，并下发 `__Host-sg_uid` cookie；
  - 转发给 DO 前删掉客户端自带的内部身份头。
- codex review 后修掉的问题（部分是上游本来就有的）：
  - COM 与对人评分结算的丢失更新：改为乐观并发，用对局数当版本号，检查和写入放在同一个 D1 批次里，冲突就重试；
  - 隐藏段位者的数据下发给了对手：改为按接收方分别生成下发数据并抹掉；
  - 正在配对中的 uid 被新连接顶掉：新连接改为收到 `already_matched`；
  - 请求体大小改为按实际读取的字节限制，并且先限流再解析。

**客户端**（`games/shogi/online/` 的逻辑层 + `ui/online/` 的界面）：
- 大厅：随机匹配（有解锁门槛；带 COM 兜底开关）、段位卡、名字（二つ名 / 自由输入）、秒读语音设置。
- 好友对战：
  - 邀请链接：系统分享面板、复制、LINE，还有懒加载的 QR 码；
  - 等待画面；
  - 「先後を入れ替えてもう一局」。
- 对局画面（真人房间与 COM 局共用）：
  - 双方计时（变色、快到时脉冲）和秒读语音；
  - 对方掉线时显示倒计时；
  - 开局遮罩、Wake Lock、送信中提示、投了；
  - 结果弹窗显示实力值变化和升段。
- 中途通过站内链接离开时，先确认，投了发出去之后才跳转（TanStack `useBlocker`）。
- 与 AI 模式共用走子交互和棋盘显示（`useBoardInput` / `GameBoard`）。

**验证：**
- 448 个测试全部通过。
- 端到端测试：`vite dev` 上，浏览器是一名玩家，Node 脚本用另一个 uid 当对手，覆盖：
  - 好友对战：建房、入座、双向同步、投了、换先后再来一局；
  - 随机匹配：约 1 秒配对成功；
  - 30 秒后切 COM 并结算实力值；
  - 通过邀请链接入座；
  - 中途离开时的确认和投了。
- 端到端测试中发现并修复：客户端要求 `/online-stats` 的响应带 `ok` 字段，而服务端不带；COM 执先手时，开局遮罩永远不会消失。

**未做：** 教程和它对应的解锁条件（P2）、等待期间的诘将棋（P4）、设置与战绩的完整备份（P6）、真机测试。

## 9.4 P2 进度（2026-09-27）

**已实现：**
- 棋谱导入（`ui/KifuImportDialog.tsx`）：粘贴 KIF / USI，或读取 `.kif` 文件（UTF-8 读出乱码时改用 Shift_JIS），边输入边显示「读成了什么、几手」。
  - AI 模式：以「读み込んだ棋譜」进入查看模式，动子就从那个局面开始对 AI（与分享链接同一套）；
  - 将棋盘：作为新对局打开，停在第 0 手。
- `/board`（`ui/BoardMode.tsx`）：一台设备两人对局。可选「每手从手番一侧看」；投了由手番方执行；重置可撤销；← → 前后。
- 教程（练习对局，`core/tutorial.ts` + `ui/online/TutorialGame.tsx`）：
  - 放水只会越来越多：子力落后 300 / 800、手数到 60 / 110、上一手想了 20 秒以上，都会降一档；
  - 三档分别是：初級；初級加上游 `ai-worker.js` 的失误参数（`AiRequest.weakness`，并关掉定式）；入門；
  - 赢了就解锁随机匹配（`online/unlock.ts` 多了一个条件）。已解锁的人在大厅里也能随时进入。
- 技演出（手筋・囲い・戦法；`core/waza/` 移植上游，`ui/WazaEffect.tsx`）：
  - 设置里有「派手 / 標準 / 控えめ / なし」四档；
  - 棋谱栏显示当前保持着的囲い / 戦法；
  - 结果弹窗列出这局出现过的技；
  - 何时显示照上游 `maybeShowWaza`：对手应手不会清掉演出；同一方再走一手且没有技才清掉；退回到那一手之前或换了对局也清掉；终局那一手不在盘上演出，只进结果汇总；
  - 三个模式的「自己」分别是：AI 模式是自己一方（查看棋谱时是双方）；将棋盘是双方；联机是自己一方。
- 战绩（`core/records/` + `records/` 移植上游，IndexedDB `sg-records`，首次保存时才加载）：
  - 三个模式终局时都会保存；同一局再次保存会覆盖旧记录，不会多一条；
  - 各模式的对局 ID：AI 模式与将棋盘是本地生成的 `GameMeta`（存在 localStorage），联机是 `房间码:created_at`，COM 局是 `bot:created_at`；
  - COM 局在实力值结算回来后会再保存一次；
  - 保存失败时结果弹窗里有「再試行」，成功时链接到 `/records`；
  - `/records` 页面（noindex）可按模式筛选，显示胜率、技统计，点开棋谱会在新标签页打开 `/?k=`。

**验证：**
- 544 个测试全部通过；typecheck 通过；build 通过（`/records` 为预渲染页面）。
- 无头浏览器实测：
  - 将棋盘：导入一手诘的局面，打入金将死，结果弹窗显示「頭金」和「对局记录已保存」，`/records` 能看到这局，结果弹窗里的链接能跳过去；
  - AI 模式：打入角形成王手飞车，演出在 AI 应手后仍然显示，退回开局后消失；
  - 中飛車的保持标签在手机宽度下不换行；
  - 教程：能走子，COM 能应手，投了后弹出结果；
  - COM 兜底局：投了后显示实力值变化，记录只有一条；
  - 设置「控えめ」能保存。
- 自我 review 与 codex review：codex 没有提 BLOCKER，4 条 WARN 已全部修复：
  - 旧的 `shogi.ai.gameId` 没有迁移，赢过的对局可能被重复计数；现在沿用旧 id；
  - 将棋盘在显示较早一手时投了，投了方取的是画面上的手番，而投了发生在棋谱末尾，胜负会记反；现在改为取末尾的手番，按钮文字也按它显示；
  - 终局那一手如果没有技，之前的演出会留在已经结束的棋盘上；现在终局时清掉；
  - 战绩页点「もっと見る」后马上切换标签，旧标签的数据可能混进新标签；现在丢弃过期的结果。
  - 复核时补的一条：将棋盘导入棋谱后一手未下就能投了，会把导入的棋谱存成一局；现在导入后到第一手之前不显示投了（`GameMeta.imported`，刷新后仍有效），对局开始时间从第一手算起。
- 顺手修了：设置里文字较长的复选框被挤小的问题（P3 遗留）。

## 9.5 P5a 方案（2026-09-27，实现前；已吸收 codex review）

目标：`shogigo.com` 上线所需的全部内容与 SEO。广告不做（D5）。做完再绑域名（D6）。

**1. 站点配置（不写死，D6）**
- 构建期的公开配置放在入库的 `.env.production` / `.env.development`。`.gitignore` 对这两个文件开例外；文件头注明「只放公开值，密钥一律进 `.dev.vars` / `wrangler secret`」，`check-build` 的密钥扫描照常覆盖它们。
  - 变量：`VITE_SITE_URL`（生产 `https://shogigo.com`，开发 `http://localhost:3160`）、`VITE_CONTACT_EMAIL=hi@shogigo.com`、`VITE_PLAUSIBLE_SRC`（先留空）。
  - 这些值在构建时就固定进预渲染页面和 Worker bundle，CI 只要检出仓库就能拿到。**不依赖**被忽略的 `.env`（codex BLOCKER）。
  - Worker 运行时才需要的值，今后放 wrangler `vars`。
- `src/site/config.ts` 统一读取和校验：
  - `SITE_URL` 缺失时构建失败；
  - `CONTACT_EMAIL` 为空时不生成 `/contact`，页脚也不出链接；
  - `PLAUSIBLE_SRC` 为空时不加载统计脚本。
- 品牌常量 `src/site/brand.ts`：站名 `shogigo`、运营者「shogigo運営事務局」、源码仓库 URL。

**2. 外壳**
- 页头：wordmark「shogigo」（自绘 SVG）链到 `/`，右侧是「戦績」。
- 页脚：運営者情報 / プライバシーポリシー / 利用規約 / お問い合わせ / ライセンス・ソースコード / 戦績。
- favicon：SVG + 32px PNG + 180px apple-touch-icon。
- 404 页：状态码 404，页面上说明情况，并放回首页的链接。

**3. 三个游戏页的文案**（`/`、`/board`、`/online`）
- 按文案规范（memory `mahjong-seo-meta-rules`）逐条执行：
  - title 不超过 28 字，版式 `名｜説明`，不放品牌名；
  - description 75–80 字；
  - 正文首段 75–80 字，用「〇〇は、〜です」的定义句开头；
  - description 和首段在前 60 字内都要有句号，最后一个「。」的位置不小于 55；
  - 不写 登録 / ダウンロード / インストール；
  - description 不写「对手是电脑」。
- 页面结构：
  - H1 带关键词；
  - 说明区放在棋盘下方，首段是说明区的第一段（棋盘仍在首屏）；
  - 三页的结构、FAQ 的问法、结尾都各写各的；定型化靠人工审稿把关。
- 本文 1,500–3,000 字，加上看得见的 FAQ。所有「本站会怎样」的描述都要在代码里核实过：
  - 11 档难度及其名称，伝説档的解锁方式；
  - 反则会被拦下并说明原因（二歩 / 打ち歩詰め / 行き所のない駒 / 自殺手）；
  - 同一局面出现 4 次为千日手、判和；连续王手的千日手判王手方负；
  - 没有入玉宣言；
  - 自动存档，用 ＜ 回退后可以从那里重新走；
  - 棋谱导入支持 KIF / USI；
  - 随机对战 30 秒找不到对手就切换 COM；掉线 60 秒判负；
  - 段级位从 9級 到 六段；
  - 练习对局的解锁条件。
- 关键词密度只作参考，不硬塞。
- 文案以代码常量的形式放在 `src/content/`，每页带 `updatedAt`。

**4. 法务与信任页**（全部预渲染）
- 页面：`/about`、`/privacy`、`/terms`、`/contact`、`/license`。
- 驹字字体改为自托管子集，同时删掉 `__root.tsx` 里 Google Fonts 的样式和 preconnect。这样浏览器自动发往外部的请求只剩 Plausible。
- 隐私政策（外部送信規律）：
  - 自动发送的只有 Plausible（不用 Cookie；按自建实例实际的脚本和事件端点来写）；
  - X / LINE 分享是用户点击后才打开的链接，分开说明；
  - 二维码在本地生成，不发往外部。
- 本站自己保存的数据：
  - localStorage：设置、对局、昵称、uid；
  - IndexedDB：战绩；
  - `__Host-sg_uid` Cookie：有效期 400 天；
  - D1：uid、实力值、胜负数（没有设保留期限，照实写，并写明删除请求怎么提）；
  - 对局房间在 24 小时后删除。
- `/license`：
  - 本站 GPL-3.0-only 与源码链接；
  - 上游「参考站」（参考站）的致谢；
  - やねうら王（GPL-3.0）及对应源码 `third_party/yaneuraou/`；
  - 评价函数（见下）；
  - 各依赖的许可证。
- 水匠 Petite 权重：按现状分发，在 `/license` 写明出处（D7）。

**5. SEO 基础**
- canonical、`og:url`、sitemap 的 `<loc>`、站内链接统一**不带结尾斜杠**（`/board`；首页是 `/`）。与现在 `/board/` 307 到 `/board` 的行为一致。
- `pageHead()` 生成 canonical、og:*（含 `og:locale=ja_JP`、`og:site_name`）和 `twitter:card`。
- JSON-LD：
  - 首页：`WebSite` + `Organization`；
  - 游戏页：`BreadcrumbList` + `VideoGame`（与其他站一致），`offers.price: 0`，`description` 与 meta 完全一致，不输出 aggregateRating；
  - 不加 FAQPage（拿不到富结果），FAQ 只作为看得见的正文。
- `sitemap.xml` 与 `robots.txt` 都是**构建时生成的静态文件**，lastmod 取自内容常量。每天更新的 sitemap 留到 P4。
- `/tsume` 占位页：加 `noindex`（仍可抓取），不进 sitemap，站内不链接。**不在** robots.txt 里屏蔽它，否则爬虫看不到 noindex。
- workers.dev 的 noindex：
  - 静态资源：在 `public/_headers` 里按主机名 `https://shogi.wsyl1329.workers.dev/*` 加 `X-Robots-Tag: noindex`；
  - Worker 生成的响应：在 `server.ts` 里按主机名补上；
  - 正式域名验收后，在 wrangler 里显式写 `workers_dev: false`。
- OG 图每页一张（1200×630 JPG），从本地 HTML 模板截图生成。生成结果入库，CI 不重新生成；模板和生成方法写在 `scripts/og/README`。

**6. 统计**：只有设置了 `VITE_PLAUSIBLE_SRC` 才加载 Plausible（defer）。

**7. 上线验收清单**（绑域名，要用户确认后执行）
- [ ] Workers Paid
- [ ] 源码仓库已公开，`/license` 的链接能打开
- [ ] `hi@shogigo.com` 能收到信（Email Routing）
- [ ] wrangler `routes` 加入 `shogigo.com` 的 custom domain；`www` 用 Cloudflare **Redirect Rule** 301 到裸域名。静态页面不经过 Worker，所以不能在 Worker 里做跳转
- [ ] 两个主机名的证书都已生效；`/`、`/board`、`/online`、带查询参数的 URL、`www` 跳转都实测过
- [ ] 正式域名下的 canonical / OG / sitemap / robots 都正确；不存在的路径返回 404
- [ ] `workers_dev: false`
- [ ] HSTS 在确认两个主机名的 HTTPS 都没问题后再开（可以晚于上线）

**8. 测试**
- 单元测试逐页精确检查：
  - title / description / 首段的字数，以及第 55–60 字之间的句号；
  - 禁用词；
  - JSON-LD 与 meta 的 description 一致；
  - canonical 不带结尾斜杠。
- 构建检查：
  - 法务页都已预渲染；
  - sitemap 与内容常量一致；
  - `/contact` 的生成与否和配置一致。

## 9.6 P5a 进度（2026-09-28）

**已实现**（§9.5 的 1–6、8）：
- 公开配置 `env/.env`（入库，只放公开键，构建检查带白名单）。
- 外壳：页头 wordmark、页脚、404 页（状态码 404）、favicon / apple-touch-icon / logo。驹字字体改为自托管子集，页面加载时不再请求 Google。
- 三个游戏页：title / description / 首段按规范写好，由 `test/core/copy.spec.ts` 精确检查；正文和 FAQ 放在棋盘下方。
  - 关键词密度约 1.0%（`/`）、1.3%（`/board`）、0.9%（`/online`）；
  - 按 h2 → FAQ → 段首的顺序自然加过词，没有再往上硬塞。
- 法务与信任页：`/about`、`/privacy`、`/terms`、`/contact`、`/license`。
  - 隐私政策中的统计和外部送信部分按 `VITE_PLAUSIBLE_SRC` 生成：没配置时写「不使用」，配置后写出实际的送信域名。
- SEO：
  - canonical 与 OG（每页一张 OG 图，由 `scripts/og/generate.py` 生成）；
  - JSON-LD：首页 `WebSite` + `Organization`，三个游戏页 `VideoGame`，其余页 `BreadcrumbList`；
  - `sitemap.xml` / `robots.txt` 在构建时生成为静态文件；
  - `/records` 与 `/tsume` 加 noindex；
  - workers.dev 上的响应加 `X-Robots-Tag: noindex`。
- 顺带修复：
  - 大厅文案里的「アプリの登録はいりません」（禁用词）；
  - 联机 COM 的强度：在 AI 模式选过伝説档的人，之前会退回中級。

**review**：
- codex 对方案的 review：3 条 BLOCKER（CI 拿不到构建配置、www 跳转不能放在 Worker 里、水匠许可）都已处理。
- codex 对实现的 review：没有 BLOCKER；7 条 WARN 都已修复，其中 6 条是文案与实际行为不符。
  - 段级位从 5 級开始；
  - 伝説档的 COM 强度；
  - 统计工具还没启用；
  - 表示名是自由输入的；
  - 反则理由的提示依赖设置；
  - 双方都掉线时判和；
  - `env/.env` 的密钥防护。
- codex 复核修复：又补了三处。
  - 掉线文案改成只写常见情况，并注明这段时间持ち時間照样减少；
  - 构建检查改用 Vite 实际用的 `node:util` `parseEnv`；
  - `VITE_PLAUSIBLE_SRC` 必须是绝对 https URL，否则构建失败。
- 未采纳：文案里写死「30 秒」切换 COM（服务端可配置）。`online.tsx` 开头写明了改配置时要一起核对的常量。

**上线前剩下的**（§9.5-7，需要用户操作或确认）：
- Workers Paid；
- 源码仓库改为公开；
- `hi@` 的 Email Routing；
- 在 Plausible 里给本站建站点，把脚本地址填进 `VITE_PLAUSIBLE_SRC`，并同时更新 `/privacy` 的日期；
- 绑定 custom domain，`www` 用 Redirect Rule 跳转；
- 上线验收；
- `workers_dev: false`。

## 9.7 规则入门 `/guide` 方案（2026-09-28，实现前）

用户指示：先只做「将棋规则入门，约 8 章」。技図鑑、打法系列、用语集都不在这次范围。结构参照 mahjongtime 的 `/guide`（`src/lib/guide/chapters.ts` + `GuideArticle`），语气用普通的です・ます体（不搬麻雀的猫口吻）。

**1. 路由（全部预渲染）**
- `/guide`：目录页。8 章的卡片，每张有标题、一句摘要和一张小图。
- `/guide/$slug`：章节页。依次是：导语（首段）→ 各小节（正文、局面图、表格、提示框）→「この章のまとめ」→ 上一章 / 下一章 →「AIと対局で試す」。
- 预渲染靠爬链接：`/guide` 链到每一章。页头和页脚加「ルール」入口，首页正文「将棋の基本ルール」一节链到 `/guide`。

**2. 数据**：`src/content/guide/chapters.ts`

```ts
interface Chapter {
  slug, order, title,
  metaTitle,        // ≤28 字
  description,      // 75–80 字，60 字内有句号，且位置 ≥55
  lead,             // 首段，同样的规则，用「〇〇は、〜です」开头
  summary,
  updatedAt,
  hero: Diagram,
  sections: Section[],
  takeaway: string[],
}
interface Section {
  heading?, paragraphs: string[], diagrams?: Diagram[], table?, callout?: { title, body },
}
```

- 正文里的链接写成 `[文字](/path)`，只允许站内路径，渲染器负责解析。
- 字数、禁用词沿用游戏页的文案规范，由测试检查。

**3. 局面图**：`BoardDiagram`，纯 SVG，服务端渲染，不开 JS 也能看

- 输入：
  - `sfen`：只要盘面部分，可以只给局部；
  - `hands`：可选；
  - `window`：显示的范围（整盘 9×9，或以某格为中心的 5×5）；
  - `marks`：格子的标记，分为可以走到的格、目标格、反则格（×）；
  - `arrows`：走子箭头；
  - `caption`：图注，用 `<figcaption>`。
- 驹沿用站内的自托管字体子集（`Piece` 的字形）。棋盘外标出筋 9…1 和段 一…九。
- 局面一律在测试里用 `core/kifu/sfen` 解析，打错就会失败。
- 每张图带 `aria-label`，并用文字说明它表示什么（给屏幕阅读器和搜索引擎）。

**4. 八章的内容**（每章 1,500–2,500 字，图数是预计）

| # | slug | 内容 | 图 |
|---|---|---|---|
| 1 | `board-and-pieces` | 盤（9×9、筋と段）、先手と後手、駒の数（玉1・飛1・角1・金2・銀2・桂2・香2・歩9）、初期配置、王将と玉将、勝ち負け（詰み・投了） | 初期配置 1 张＋驹一览 |
| 2 | `piece-moves` | 8 种驹的走法（表＋各一张图）、大駒と小駒、桂が駒を跳び越える | 8 |
| 3 | `promotion` | 敵陣、成れる 3 种时机、成った駒の動き（竜・馬・金と同じ動き）、不成を選ぶ場面、強制的に成る場合（本作は自動で成る・選択パネル） | 4 |
| 4 | `drops` | 持ち駒、打てる場所、成駒は元に戻る、打ってすぐは成れない（打ったあと動くときに成る） | 3 |
| 5 | `check-and-mate` | 王手、王手の防ぎ方 3 种（逃げる・取る・合駒）、詰み（頭金など）、投了 | 4 |
| 6 | `fouls` | 二歩（と金は数えない）・打ち歩詰め（突き歩詰めは可）・行き所のない駒・王手放置、本作では指せず理由が出る | 4 |
| 7 | `sennichite-jishogi` | 千日手（同一局面 4 回）、連続王手の千日手、入玉と持将棋（24 点法・27 点法的一般规则）＋**本作没有入玉宣言** | 3 |
| 8 | `kifu-notation` | 符号（７六歩）、▲△、「同」、右・左・上・引・寄・直、成・不成・打、KIF 形式、本作の棋譜機能（コピー・保存・読み込み） | 3 |

**5. 事实核对**：凡是写「本作では」的内容，都要先在引擎和 UI 里确认。
- 千日手：`engine` 的 `checkSennichite`；
- 升变：`useBoardInput` 的 `mustPromote` / `canPromote`；
- 反则的提示文案：`messages.ts`；
- 没有入玉宣言：やねうら王开了 `NoEnteringKing`，JS AI 同样不宣言；
- 二歩只数没成的歩；
- 打ち歩詰め：`hints` / `engine`。
- 一般规则（24 点法 / 27 点法、符号写法）按日本将棋联盟的通行规则写，不写本作不支持的操作。

**6. SEO**
- 章节页：
  - canonical 为 `/guide/<slug>`；
  - OG 用规则入门专用的一张图（`scripts/og` 生成）；
  - JSON-LD 为 `Article`（`dateModified` = updatedAt）＋ `BreadcrumbList`。
- 目录页：JSON-LD 为 `ItemList` ＋ `BreadcrumbList`。
- sitemap：lastmod 取各章的 `updatedAt`，目录页取各章中最新的日期。

**7. 测试**
- 每章检查：metaTitle / description / lead 的规则、禁用词、slug 不重复、`order` 连续、所有局面图的 SFEN 都能解析、正文里的链接都指向已存在的路由。
- 构建检查：`/guide` 和 8 章都已预渲染。

**不在范围内**：技図鑑、打法系列、用语集、每章各自的 OG 图、动画和分步控件。

**codex review（2026-09-28）需要吸收的内容**（实现时照此修改上面的方案）：
- BLOCKER：
  - 局面图的数据改为「完整 9×9 摆子数据＋`window` 裁切」，另写轻量的结构校验。现有的 `parseSfen` 要求完整合法的局面，会拒绝二歩这类教学用的反则局面；只有需要合法局面的图才附完整 SFEN 再校验。
  - `/guide/$slug` 在 loader 里查表，未知 slug 抛 `notFound()`；head 和组件用同一份章节数据；目录页在服务端 HTML 里输出真实的链接（参数路由不会被自动枚举）。
  - **引擎 bug**：连续王手的千日手只检查重复局面那几手是否王手，没有检查中间每一手（`engine/index.ts` 的 `checkSennichite`）。写第 7 章之前，先补「中途断过王手」的反例测试，并修正引擎。
- WARN：
  - 第 7 章把入玉宣言法、24 点法、27 点法的适用条件分开写，按 JSA 对局规则；本作没有入玉宣言（やねうら王开了 `NoEnteringKing`，JS AI 只会走子或投了）。
  - 反则的提示写成「ヒント表示がオンなら理由を示します」。必须成时自动成；可成可不成时弹出选择。
  - sitemap 日期只有一个来源：非 guide 页继续用 `LASTMOD`；guide 页从 `chapters` 的 `updatedAt` 派生，再合并起来。
  - 字体子集只用于驹字和棋盘坐标；图注用系统字体；×、箭头画成 SVG 形状。
  - 补内容：第 1 章加振り駒；第 6 章加二手指し、不合规则的走法、不能成的驹，并区分「实际对局」和「本站操作」；第 7 章千日手和持将棋各用一个 h2。
- NIT：
  - 章节页不套用游戏页的「無料」「将棋…は、」测试，只共用字数和唯一性检查；链接检查看渲染出来的 `<a href>`。
  - `pageHead` 增加 `og:type`，章节页用 `article`。


## 9.7.1 规则入门的进度（2026-09-28）

**已实现**（已吸收上面 codex review 的意见）：
- **引擎修正**：连续王手的千日手改为按 JSA 规则判定：从该局面第一次出现到第 4 次出现之间，一方的每一手都是王手，才判王手方负。补了两个测试：
  - 反例：重复的局面是被将军的局面，但中间走过闲着，应判普通千日手；
  - 对侧：重复的局面没有被将军，但一方每手都在将军，应判连续王手。
  - 联机服务端用的是同一个引擎，一起修好了。
- **页面**：`/guide`（目录页，卡片带小图）和 `/guide/<slug>` 共 8 章，都预渲染。
  - 每章有：面包屑、章内目录、正文、局面图、表格、提示框、本章要点、上一章 / 下一章、「AIと対局してみる」；
  - 未知 slug 返回 404；
  - JSON-LD：章节页为 `Article` ＋ `BreadcrumbList`，目录页为 `ItemList` ＋ `BreadcrumbList`；
  - `og:type=article`，共用一张 OG 图 `/og/guide.jpg`。
- **局面图**：`BoardDiagram` 是服务端渲染的 SVG。
  - 驹的位置用稀疏写法（`'55': '玉'`、`'51': 'v王'`），加裁切窗口、标记（可走格 / 注目格 / ×）和箭头；
  - 驹的走法图全部由引擎的走法表算出（`moveMarks`）；
  - 故意画的反则局面只做形式检查，不交给引擎。
- **文案**：
  - 每章都有 meta 标题、description、首段，按文案规范写，由 `test/core/guide.spec.ts` 检查；
  - 8 章的 description 开头和结尾各写各的（第一稿有 6 章是「将棋の〜を図で解説します。」，已改）；
  - 一般规则以 JSA 对局规则（2025-01-01 版）为准；入玉宣言的具体点数条件没能核实，所以不写。
- **sitemap**：非规则页的日期继续来自 `LASTMOD`（新增 `/guide`），各章的日期来自章节自己的 `updatedAt`。
- **入口**：页头加「ルール」，首页正文链到 `/guide`，各章正文里互相链接（测试检查链接都指向存在的路由）。
- **构建检查**：
  - 目录页和 8 章都已预渲染；
  - 不允许出现 `xxx/index.html` 这种重复页。index 路由会被预渲染器以 `/guide/` 收录并生成重复页，已在预渲染过滤里排除带结尾斜杠的路径。

**codex review（实现后）**：
- 1 条 BLOCKER：打ち歩詰め的图，1 九的香在打歩之前就已经在将后手的王（局面不成立）。改为用 2 三的银保护 1 二，突き歩詰め图也改用同一个保护驹。
- WARN 全部修正：
  - 振り駒应以上座者的歩为准；
  - 「どの駒も」「小駒は」漏掉了不能成的玉和金；
  - 被将军时不能随便打驹，「打てない場所」加上这一条；
  - 王手连线只在隔着距离将军时显示，将死时出结果画面；
  - 24 点法需要双方合意，另写入玉宣言法和 500 手的规定；
  - 联机的棋谱不能点击跳转，写明只有 AI 对局和将棋盘可以；
  - `/guide` 的 lastmod 取自身与各章中最新的日期。
- NIT 修正：图注里坐标的顺序；「正方形の盤」改为「四角い盤」；持驹数量的说法；表格首列改为 `<th scope="row">`。
- 双方在循环中都每手将军时，JSA 条文没有明确规定。本站按普通千日手处理，引擎里加了注释说明这个方针。

## 9.8 设计改进（2026-09-28，按 taste-skill 的 redesign 流程）

用户指定用 github.com/leonxlnx/taste-skill 改进页面设计。用的是其中的 `redesign-skill` 和主 skill 的 Redesign Protocol：保留现有品牌（Redesign-Preserve），不改信息架构、URL 和文案。

- **Design Read**：日语浏览器将棋游戏，面向各年龄层的休闲玩家（含初学者），沉稳的和风（木・和纸）。调节值：变化 4 / 动效 3 / 密度 5。
- **审计出的问题 → 改法**：
  - 冷灰和暖纸色混用 → 墨色、灰色统一为暖色系；
  - 强调色有 3 个（朱・蓝・绿）→ 只留朱，链接和焦点环用深朱，「＜＞」按钮改成中性的深色；
  - 标题没有特点 → 用系统明朝体（不增加下载），加 `word-break: auto-phrase` 和 `text-wrap: balance`，正文用 `pretty`；
  - 数字不等宽 → 全站 `tabular-nums`；
  - 按钮没有悬停、按下反馈 → 加上，并尊重 reduced-motion；
  - 页头没有当前页标识 → 加上；
  - 没有「本文へスキップ」→ 加上；
  - 图标用文字符号（⚙⇅✕▸＜＞）→ 换成自绘的 SVG 图标集（`src/site/icons.tsx`，线宽统一 1.75）；
  - 禁用按钮是发白的朱色 → 改为中性色；
  - 纯色底 → 加一层淡淡的和纸纹理（内联 SVG noise）；
  - 纯黑阴影 → 改用纸色色调；
  - 桌面端页头与内容列没对齐 → 页头、页脚宽度都改为 720px。
- **codex review**：没有 BLOCKER。
  - 修了两处对比度不足：空持驹「なし」2.0:1 → 深木色；联机计时器的警告色 3.6:1 → 深琥珀（原本就有的问题）。
  - 禁用按钮的字色稍微加深；删掉 `.icon-button` 已经不起作用的 font-size；「考え中」的冷色背景改为暖色。
  - 段位「銀」徽章的冷灰是有意为之，保留。
  - 和纸纹理只是一张 180px 的平铺图，渲染成本很低，保留。
- **没做**（需要另外决定）：
  - skill 规定面向消费者的页面必须有 dark mode。棋盘和驹的配色都要重新设计，工作量大，另外提议；
  - 桌面端双栏（棋谱放在棋盘右边）会改动游戏 UI 的布局，另外提议。

## 9.9 桌面端布局（2026-09-28）

用户指出桌面端内容太窄。原因不在参考站，是本站自己的设定：
- 每格上限 50px（棋盘约 476px，这是为了在 800px 高的屏幕里放得下）；
- 页头、页脚在设计改进时收到了 720px；
- 没有麻雀タイム那样的侧栏（广告、相关游戏）。

改法（手机端完全不变）：
- **外层宽度**：页头、页脚改为 1280px，与麻雀タイム的 `max-w-screen-xl` 一致。正文和法务页改为 768px，与麻雀タイム正文的 `max-w-3xl` 一致。
- **对局页（≥1024px）**：改成双栏网格，左栏棋盘，右栏 360px 放工具栏、棋谱和按钮。
  - 每格尺寸按窗口的宽和高算，范围 40–64px（1440×900 下 64px，1280×800 下约 55px）；联机多了上下两行对手名，高度另算。
  - JSX 里加了 `game-top` / `game-main` / `game-bottom` 三个包装层，手机端是 `display: contents`，DOM 的顺序和布局都不变。
  - 宽屏下棋谱默认展开（`useOpenOnWideScreen`，在水合之后再展开）。
- **联机大厅**：宽屏下卡片两列排列。
- **战绩页**：宽屏下 760px。
- codex review 后的修正：
  - 不支持 `dvh` 的浏览器会让整条 `--cell` 失效、棋盘错乱：先写 `vh` 版，再用 `@supports (height: 100dvh)` 覆盖；
  - 窗口太矮时双栏放不下：双栏只在 ≥1024px 宽且 ≥720px 高时启用，格子下限降到 36px（1024×600 退回单栏）；
  - 大厅有报错消息时卡片错位：报错消息横跨两列。
- **联机走子的动画会重播一次**（用户发现）：自己的着手先乐观地显示在盘上（没有动画），等服务端确认、棋谱变长后，又从起点播了一遍滑动。改为和 AI 对局一样，在点击走子时就播动画；确认时，走子方是自己就不再播。技的演出改为由「确认后的棋谱长度」触发。
  - codex 复核后改为逐手比对：记下本页刚走的那一手（第几手、USI），只有服务端确认的正是这一手时才跳过动画。这样同一座位另开标签页走的己方着手、重连时一次补进的多手也会正常播放；技的演出只在正好新增一手时触发，重连补手不会重播旧的技。
  - 已知取舍：乐观走子被服务端拒绝时（超时、对局已结束等竞态），会先滑动再回到原位。客户端已经做过合法性校验，这种情况很少见。
  - 实测（好友对战，对手用脚本，修改前后各一次）：点击后约 10ms 滑动一次，确认时不再动；对手的着手到达时滑动一次。
- ⚠️ `desktop.css` 的选择器以 `body` 开头：`@import` 进来的 CSS 在层叠顺序上排在 `styles.css` 正文之前，同权重时正文里的 `.game` 会覆盖它。

## 10. 验证方式

- **core**：vitest。
  - 规则：二歩、打歩詰め、必成、自将、千日手、連続王手；
  - 棋谱 KIF/USI 往返，**含非平手的 `initialSfen`**；
  - 技判定（移植上游测试）；
  - **两份规则的差异测试**：随机局面下比较 `core/engine` 与 `ai-worker.js` 的合法手集合。
- **server**：`@cloudflare/vitest-plugin`（取代了旧的 `@cloudflare/vitest-pool-workers`），以 `src/server.ts` 为 `main`，**经过 Worker 入口发 HTTP/WS 请求**来测路由，不只直接调 DO；另用 `runInDurableObject`、alarm 测试和 WS 休眠后恢复的测试。覆盖：
  - 超时、掉线、过期；
  - revision 冲突；
  - 匹配窗口放宽、同 uid 挤掉旧连接、重连后重发 `botAt`；
  - bot ticket 的各种拒绝路径；
  - 评分计算（移植上游测试）；
  - **`/online-stats` 的缓存隔离**：带 uid 的请求不命中缓存，无 uid 的缓存响应不带 Set-Cookie。
- **AI**：node 里跑 wasm 做冒烟测试：
  - 各档都能出着；非平手局面发 `position sfen … moves`；入玉局面不回 `win`；
  - 状态机：重开后立即请求、搜索中换难度、悔棋后立即请求、超时 terminate 后重建，都不串结果。
- **E2E**：Playwright，两个 context 模拟两名玩家。本机需要 `NO_PROXY=*`。覆盖：
  - 友达局下完一局，再用「同じ設定でもう一局」开第二局；
  - 随机匹配配对成功；无人时切 COM 并计分；
  - 掉线 60 秒判负、超时判负、千日手；
  - 刷新后回到原座位；冲突回滚后，重放出的盘面与服务端一致；
  - 预渲染页面直接打开带参数的深链接（`/?k=`、`/online/?room=`）；
  - 在 `vite dev` 与生产构建（`wrangler dev` 或 workers.dev 预览）下各跑一遍。
- **人工**：
  - iPhone Safari：nosimd 兜底、音频解锁、清掉 localStorage 后 uid 从 cookie 恢复；
  - Android Chrome、桌面三浏览器；
  - 弱网：开关飞行模式后能重连。
- **每个阶段完成后**：自我 review（通读 diff）→ codex review → 修复，与 mahjongtime 的纪律一致。

---

## 11. 风险

| 风险 | 对策 |
|---|---|
| 新站人少，随机匹配几乎全落到 COM | COM 兜底默认开且等待短；段位对 COM 局也计分（有上限）；等待期间做诘将棋减轻焦虑 |
| GPL 公开源码后被人抄走 | 已接受的代价（D1）；站点价值在内容和运营，不在代码 |
| Matchmaker 单例 DO 成为瓶颈 | 上游约 1,500 局/日仍无问题；将来按段位分片 |
| 老 iPhone 没有 wasm SIMD | 自动走 nosimd（同样节点数约慢 4.7 倍）；伝説3 在低端机上会很慢，UI 要能让人耐心等 |
| AdSense 审核需要内容 | P5a / P5b 先把正文和法务页做厚再申请 |
| TanStack Start 相对年轻，Cloudflare 集成还在演进 | P0 先把 SSR、预渲染、DO、WS、D1、`_headers` 全部打通再写业务；联机代码不依赖框架（由 `src/server.ts` 直接路由），万一要换框架，影响只在页面层 |
| 上游改协议或参数 | 我们是分叉，不自动跟进；需要时从 `downgame/shogi-upstream` 拉取对照 |

---

## 修订记录

**v2（2026-09-27）吸收 codex review 的意见：**

- **BLOCKER（3 条，全部采纳）**
  1. 对局基准改为 `{initialSfen, moves}`；非平手局面一律发 `position sfen … moves`（§2.3、§4.1、§5.2）。
  2. `/online-stats` 只缓存不带 uid 的请求，带 uid 的绕过缓存（§6.5-4）。
  3. wasm 的对应源码补上 mizar 的 `source.tar.xz` 与 `Copying.txt`；水匠权重的许可列为 P0 核实项（§1、§2.2）。
- **WARN（全部采纳，或按建议调整）**
  - 补上静态导出的细节：Suspense、`_headers`、trailingSlash；P0 测量 Next 的开销（§2.1）。
  - 开发时 HTTP / WS 都经过同一个 API 地址转换器，并处理 CORS 预检（§2.1）。
  - 改掉「规则只有一份」「AI 完全相同」的说法；AI 着法都经规则校验；增加两份规则的差异测试（§2.3、§5.1）。
  - yaneuraou worker 请求改为状态机，同一时刻只有一条 `go`（§5.2）。
  - 区分内部 `GameState` 与对外 `PublicGameState`，客户端重放后与服务端比对（§6.5-1）。
  - 等待改为 30 秒后，同步修订 ticket 限流的假设；`botAt` 由服务端计算并在重连时重发（§1 D4、§6.2）。
  - **放弃 `/api/bot-start`**，COM 局分数定位为轻量进度（§6.2）。
  - Rate Limiting binding 只做粗限流，按端点设阈值（§6.5-2）。
  - rematch 简化为「同じ設定でもう一局」重新建房（§6.5-7）。
  - 成本改为先建负载模型，alarm 和 RPC 也计请求（§6.6）。
  - M1 收窄：技演出、教程、`/board/`、战绩移到 M1 之后；uid cookie 提前到 P3（§9）。
- **NIT（全部采纳）**
  - 首发加「診断情報をコピー」（§5.3-17）。
  - GPL 说明改为具体的合规清单（§1）。

**v3（2026-09-27）按用户决定改框架与许可证：**

- D1 定为 A（整站以 GPL-3.0-only 公开源码）；D3 定为 TanStack Start 官方 Cloudflare 起步方式。**不用 ShipAny 模板**：它的协议禁止公开源码，与 A 冲突，而且支付等功能用不上（§1.1）。
- 架构从「Next 静态导出」改为「TanStack Start + `@cloudflare/vite-plugin`」：`src/server.ts` 导出 DO，联机路由优先处理；页面默认构建时预渲染，内容会变的页面按请求 SSR（§2.1）。
- 开发改为单端口：不再需要 API 地址转换器和开发期 CORS。v2 里对应的 codex 意见随之失效（§2.1）。
- 目录按多游戏站组织，并定下「只放对位置、不预先抽象」的原则：上游本就与游戏无关的联机部分进 `src/online/`，将棋专属部分进 `src/games/shogi/`（§2.2、§2.3）。
- 每日诘将棋改为按请求 SSR + 边缘缓存，不必每天重建部署（§7）。
- P0 的验收改为：`vite dev` 与线上 Worker 下，SSR、预渲染、D1、DO、WS、`_headers` 全部可用（§9）。

**v3.1（2026-09-27）吸收 codex 对 v3 的 review：**

- **BLOCKER（3 条，全部采纳）**
  1. SSR 路由必须从预渲染中显式排除，构建后断言；跨 JST 零点测试（§2.1、§7）。
  2. 联机路由按上游实际端点逐条匹配；房间 WS 先在 Worker 验 token 再转 DO（§2.1）。
  3. 免费档 10ms CPU 上限不够 SSR 和长棋谱重放：**上线即用 Workers Paid**，并在线上实测 CPU（§6.6）。
- **WARN（6 条，全部采纳）**
  - 按上游的真实依赖，Matchmaker、bot-result、协议都放进 `games/shogi/server`，只有纯函数放 `src/online/`（§2.2、§2.3、§3）。
  - 边缘缓存二选一：前置缓存优先，Cache API 兜底；缓存的响应不带个人数据和 cookie（§2.1）。
  - 带参数的深链接先水合外壳再应用参数；`html_handling` 跳转是 307（§2.1）。
  - 测试包改为 `@cloudflare/vitest-plugin`，经过 Worker 入口测路由（§10）。
  - 公开仓库的密钥规则；`database_id` 不是密钥（§6.5-5）。
  - `initialSfen` 要贯穿棋谱模块，工作量计入 P1（§2.4、§9）。
- **NIT**：每日诘将棋页 canonical 指向自己，回看用日期 URL（§7）。
