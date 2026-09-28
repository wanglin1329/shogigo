import { Link, createFileRoute } from '@tanstack/react-router'

import { OPERATOR, SITE_NAME } from '../site/brand'
import { CONTACT_EMAIL, SITE_URL } from '../site/config'
import { breadcrumb, pageHead } from '../site/seo'
import { TextPage } from '../site/TextPage'

export const Route = createFileRoute('/about')({
  head: () =>
    pageHead(
      {
        path: '/about',
        title: `運営者情報｜${SITE_NAME}`,
        description: `${SITE_NAME}の運営者とサイトの概要です。ブラウザで指せる将棋サイトとして、AIとの対局とオンライン対局、将棋のルール入門を提供しています。`,
      },
      [breadcrumb([{ name: SITE_NAME, path: '/' }, { name: '運営者情報', path: '/about' }])],
    ),
  component: About,
})

function About() {
  return (
    <TextPage path="/about" title="運営者情報">
      <h2>{SITE_NAME}について</h2>
      <p>
        {SITE_NAME}
        は、ブラウザで将棋を指せるサイトです。パソコンでもスマートフォンでも、ページを開けばすぐに対局できます。料金はかかりません。
      </p>
      <ul>
        <li>
          <Link to="/">AIと対局</Link>：入門から伝説3まで11段階の強さのAIと指せます
        </li>
        <li>
          <Link to="/online">だれかと対局</Link>：オンラインで知らない相手や友だちと指せます
        </li>
        <li>
          <Link to="/guide">将棋のルール入門</Link>：盤と駒から反則、棋譜の読み方まで、図を使って8章で解説しています
        </li>
      </ul>
      <p>
        サイトのソースコードは GNU General Public License v3.0 で公開しています。使っている将棋エンジンや元にしたプログラムは
        <Link to="/license">ライセンス・ソースコード</Link>にまとめています。
      </p>

      <h2>運営者</h2>
      <div className="table-scroll">
        <table>
          <tbody>
            <tr>
              <th>サイト名</th>
              <td>{SITE_NAME}</td>
            </tr>
            <tr>
              <th>URL</th>
              <td>{SITE_URL}</td>
            </tr>
            <tr>
              <th>運営者</th>
              <td>{OPERATOR}</td>
            </tr>
            {CONTACT_EMAIL && (
              <tr>
                <th>お問い合わせ</th>
                <td>
                  <Link to="/contact">お問い合わせページ</Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>ポリシー</h2>
      <ul>
        <li>
          <Link to="/privacy">プライバシーポリシー</Link>
        </li>
        <li>
          <Link to="/terms">利用規約</Link>
        </li>
      </ul>
    </TextPage>
  )
}
