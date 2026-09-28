import { createFileRoute, notFound } from '@tanstack/react-router'

import { SITE_NAME } from '../site/brand'
import { CONTACT_EMAIL } from '../site/config'
import { breadcrumb, pageHead } from '../site/seo'
import { TextPage } from '../site/TextPage'

export const Route = createFileRoute('/contact')({
  // Without an address there is nothing to show (and no footer link to here).
  beforeLoad: () => {
    if (!CONTACT_EMAIL) throw notFound()
  },
  head: () =>
    pageHead(
      {
        path: '/contact',
        title: `お問い合わせ｜${SITE_NAME}`,
        description: `${SITE_NAME}へのお問い合わせ窓口です。不具合のご報告、ご意見、オンライン対局の記録の削除依頼などはメールでお送りください。`,
      },
      [breadcrumb([{ name: SITE_NAME, path: '/' }, { name: 'お問い合わせ', path: '/contact' }])],
    ),
  component: Contact,
})

function Contact() {
  return (
    <TextPage path="/contact" title="お問い合わせ">
      <p>ご意見・不具合のご報告・そのほかのお問い合わせは、次のアドレスまでメールでお送りください。</p>
      <p>
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>

      <h2>不具合をご報告いただくとき</h2>
      <p>次の内容があると、原因を早く見つけられます。</p>
      <ul>
        <li>起きたページ（AIと対局・だれかと対局・ルール入門など）と、おおよその日時</li>
        <li>お使いの端末とブラウザ（例：iPhone の Safari、Windows の Chrome）</li>
        <li>何をしたときに、どうなったか</li>
        <li>
          「AIと対局」の設定（⚙）にある「診断情報をコピー」で得られる文字列。局面や AI の状態が入っていて、個人を特定する情報は含まれません
        </li>
      </ul>

      <h2>オンライン対局の記録の削除</h2>
      <p>
        「だれかと対局」の実力値と対局数を消したい場合は、その旨をお知らせください。本人確認のため、実力値を記録しているブラウザでの操作をお願いすることがあります。
      </p>

      <h2>返信について</h2>
      <p>内容を確認のうえ、必要に応じて返信いたします。すべてのお問い合わせにお返事できるとは限りませんので、あらかじめご了承ください。</p>
    </TextPage>
  )
}
