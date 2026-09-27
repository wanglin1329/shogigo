import { Link, createFileRoute } from '@tanstack/react-router'

import { SITE_NAME } from '../site/brand'
import { SOURCE_URL } from '../site/config'
import { breadcrumb, pageHead } from '../site/seo'
import { TextPage } from '../site/TextPage'

export const Route = createFileRoute('/license')({
  head: () =>
    pageHead(
      {
        path: '/license',
        title: `ライセンス・ソースコード｜${SITE_NAME}`,
        description: `${SITE_NAME}のソースコードとライセンスです。GPL-3.0で公開しているソースコードの場所、元にした参考站、将棋エンジンのやねうら王、使っているライブラリをまとめています。`,
      },
      [breadcrumb([{ name: SITE_NAME, path: '/' }, { name: 'ライセンス・ソースコード', path: '/license' }])],
    ),
  component: License,
})

function License() {
  return (
    <TextPage path="/license" title="ライセンス・ソースコード">
      <h2>本サイトのソースコード</h2>
      <p>
        {SITE_NAME}のソースコードは、GNU General Public License v3.0（GPL-3.0-only）で公開しています。ブラウザで動くプログラム、将棋エンジン、対局サーバーのすべてが含まれます。
      </p>
      <ul>
        <li>
          ソースコード：<a href={SOURCE_URL}>{SOURCE_URL}</a>
        </li>
        <li>
          ライセンス全文：<a href="https://www.gnu.org/licenses/gpl-3.0.html">GNU General Public License v3.0</a>
          （リポジトリの <code>LICENSE</code> にも同じものがあります）
        </li>
      </ul>

      <h2>元にしたプログラム：参考站</h2>
      <p>
        本サイトは、参考站 が GPL-3.0 で公開している「参考站」（
        <a href="参考站">参考站>
        ）のプログラムを元にしています。将棋のルール判定、棋譜の読み書き、AI（入門〜超級）、手筋・囲いの判定、対局サーバー、戦績の保存などを移植して使っています。画面、デザイン、文章は本サイトで新しく作ったもので、参考站 のものは使っていません。
      </p>
      <ul>
        <li>
          ソースコード：<a href="参考站的源码">参考站的源码>
        </li>
        <li>移植したファイルには、元の著作権表示と、本サイトでの変更内容を記しています。</li>
      </ul>

      <h2>将棋エンジン：やねうら王と水匠</h2>
      <p>
        「達人級」から「伝説3」までの AI には、将棋エンジン「やねうら王」の WebAssembly 版を使っています。評価関数は、たややん氏による「水匠」の小型版「水匠 Petite（SuishoPetite 20211123）」です。
      </p>
      <ul>
        <li>
          やねうら王（yaneurao 氏、GPL-3.0）：<a href="https://github.com/yaneurao/YaneuraOu">https://github.com/yaneurao/YaneuraOu</a>
        </li>
        <li>
          WebAssembly 版の作成：<a href="https://github.com/mizar/YaneuraOu">mizar 氏</a>、
          <a href="https://github.com/usumerican/yaneuraou-suisho-petite">usumerican 氏</a>、参考站（参考站）
        </li>
        <li>
          配信している wasm ファイルに対応するソースコードとビルド手順：リポジトリの <code>third_party/yaneuraou/</code>
        </li>
      </ul>

      <h2>フォント</h2>
      <ul>
        <li>
          駒の文字：しっぽり明朝 B1（Shippori Mincho B1、The Shippori Mincho Project Authors、SIL Open Font License 1.1）。使う文字だけを切り出して配信しています。ライセンス：
          <a href="/fonts/OFL.txt">OFL.txt</a>
        </li>
      </ul>

      <h2>ライブラリ</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>名前</th>
              <th>ライセンス</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>React / React DOM</td>
              <td>MIT</td>
            </tr>
            <tr>
              <td>TanStack Router / TanStack Start</td>
              <td>MIT</td>
            </tr>
            <tr>
              <td>Tailwind CSS</td>
              <td>MIT</td>
            </tr>
            <tr>
              <td>node-qrcode（招待リンクの QR コード）</td>
              <td>MIT</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        サイトの運営者については<Link to="/about">運営者情報</Link>をご覧ください。
      </p>
    </TextPage>
  )
}
