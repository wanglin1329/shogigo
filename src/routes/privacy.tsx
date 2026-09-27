import { Link, createFileRoute } from '@tanstack/react-router'

import { OPERATOR, SITE_NAME } from '../site/brand'
import { CONTACT_EMAIL, PLAUSIBLE_SRC } from '../site/config'
import { breadcrumb, pageHead } from '../site/seo'
import { TextPage } from '../site/TextPage'

export const Route = createFileRoute('/privacy')({
  head: () =>
    pageHead(
      {
        path: '/privacy',
        title: `プライバシーポリシー｜${SITE_NAME}`,
        description: `${SITE_NAME}のプライバシーポリシーです。ブラウザに保存する情報、オンライン対局でサーバーに送る情報、アクセス解析と外部送信について説明します。`,
      },
      [breadcrumb([{ name: SITE_NAME, path: '/' }, { name: 'プライバシーポリシー', path: '/privacy' }])],
    ),
  component: Privacy,
})

/** Where the analytics script is loaded from; its events go to the same origin. Empty = none. */
const analyticsHost = PLAUSIBLE_SRC ? new URL(PLAUSIBLE_SRC).host : ''

function Privacy() {
  return (
    <TextPage path="/privacy" title="プライバシーポリシー">
      <p>
        {OPERATOR}（以下「当事務局」）は、{SITE_NAME}
        （以下「本サイト」）での利用者の情報の扱いを次のとおり定めます。本サイトには会員の仕組みがなく、氏名・メールアドレス・電話番号などの入力を求めることはありません。例外は、オンライン対局の表示名（自由に入力でき、対局相手に表示されます）と、お問い合わせのメールです。
      </p>

      <h2>1. ブラウザに保存する情報</h2>
      <p>本サイトは、次の情報をお使いのブラウザ（ローカルストレージ・IndexedDB）に保存します。これらは端末の中にだけあり、2. に書いたものを除いて当事務局のサーバーには送られません。</p>
      <ul>
        <li>設定（駒の表示、音、演出など）</li>
        <li>対局中の棋譜と、AIとの対局の成績（勝ち数、解放した強さ）</li>
        <li>戦績（終わった対局の棋譜と結果、出てきた技）</li>
        <li>オンライン対局で使う表示名と、ランダムに作った利用者ID</li>
      </ul>
      <p>ブラウザの「サイトデータの削除」などで、いつでも消すことができます。</p>

      <h2>2. オンライン対局で送信・保存する情報</h2>
      <p>「だれかと対局」を使うと、対局のために次の情報が本サイトのサーバーに送られます。</p>
      <ul>
        <li>利用者ID（ランダムな文字列で、個人とは結びついていません）</li>
        <li>表示名（対局相手の画面に表示されます）</li>
        <li>指し手、持ち時間の設定、先手・後手の希望、段級位を表示するかどうか</li>
      </ul>
      <p>サーバーでは次のように保存します。</p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>保存する情報</th>
              <th>目的</th>
              <th>保存期間</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>対局の部屋（表示名、指し手、持ち時間、結果）</td>
              <td>対局を進めるため・再接続のため</td>
              <td>部屋を作ってから24時間</td>
            </tr>
            <tr>
              <td>利用者IDごとの実力値、到達した段級位、勝ち・負け・引き分けの数、更新日時</td>
              <td>段級位と実力値を表示するため</td>
              <td>期間の定めなし（削除のご依頼は下記 6. へ）</td>
            </tr>
            <tr>
              <td>実力値を動かした対局の識別符号、日付、対局した利用者IDの組</td>
              <td>同じ対局の二重計算を防ぐため・1日の対局数の上限を数えるため</td>
              <td>判定には当日分だけを使い、3日より前のものは順次消去</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        ブラウザのデータを消したあとでも実力値を引き継げるよう、利用者IDを Cookie（<code>__Host-sg_uid</code>、有効期間400日）にも保存します。この
        Cookie は本サイトとの通信にだけ使われ、ほかのサイトには送られません。
      </p>

      <h2>3. アクセス情報</h2>
      <p>
        本サイトのサーバーは Cloudflare, Inc. のサービスで動いています。短い時間に大量の通信が来たときに制限をかけるため、IP
        アドレスを一時的に使います。障害の調査のため、エラーの記録（アクセスされたURL、日時など）を一定期間保存することがあります。
      </p>

      <h2>4. アクセス解析</h2>
      {analyticsHost ? (
        <p>
          本サイトは、利用状況を把握してサイトを良くするために、アクセス解析ツール「Plausible Analytics」を使っています。Plausible Analytics は
          Cookie を使わず、閲覧されたページ、参照元、ブラウザ・OS・端末の種類、国・地域などを集計します。個人を識別できる形では記録しません。
        </p>
      ) : (
        <p>本サイトは現在、アクセス解析ツールを使っていません。</p>
      )}

      <h2>5. 外部送信について</h2>
      <p>電気通信事業法に基づき、本サイトを閲覧したときに利用者の端末から外部へ送られる情報を公表します。</p>
      {analyticsHost ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>送信先</th>
                <th>送信される情報</th>
                <th>利用目的</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  Plausible Analytics（<code>{analyticsHost}</code>）
                </td>
                <td>閲覧したページのURL、参照元のURL、ブラウザ・OS・端末の種類、画面の幅、IPアドレスから推定した国・地域</td>
                <td>アクセス数の集計とサイトの改善</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p>現在、本サイトを閲覧したときに、利用者の端末から本サイト以外へ自動で情報が送られることはありません。</p>
      )}
      <p>
        対局結果の「Xで共有」「LINEで送る」は、ボタンを押したときにだけ X・LINE のページを開きます。開いた先での情報の扱いは、それぞれのサービスの定めに従います。招待リンクの QR
        コードは端末の中で作っており、外部には送りません。
      </p>

      <h2>6. 情報の削除</h2>
      <p>
        ブラウザに保存された情報は、ブラウザの設定から削除できます。サーバーに保存された実力値と対局数の削除をご希望の場合は、
        {CONTACT_EMAIL ? <Link to="/contact">お問い合わせ</Link> : 'お問い合わせ窓口'}
        からご連絡ください。
      </p>

      <h2>7. 第三者への提供</h2>
      <p>法令に基づく場合を除き、利用者の情報を第三者に提供することはありません。サーバーの運用は Cloudflare, Inc. のサービスに委託しています。</p>

      <h2>8. 改定</h2>
      <p>このポリシーは、必要に応じて改定することがあります。改定したときは、このページで内容と最終更新日をお知らせします。</p>

      <h2>9. お問い合わせ</h2>
      <p>
        このポリシーについてのご質問は、
        {CONTACT_EMAIL ? <Link to="/contact">お問い合わせページ</Link> : 'お問い合わせ窓口'}
        からご連絡ください。
      </p>
      <p>運営者：{OPERATOR}</p>
    </TextPage>
  )
}
