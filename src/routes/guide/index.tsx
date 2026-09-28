import { Link, createFileRoute } from '@tanstack/react-router'

import { BoardDiagram } from '../../content/guide/BoardDiagram'
import { CHAPTERS } from '../../content/guide/chapters'
import { GUIDE_COPY } from '../../content/guide'
import { SITE_NAME } from '../../site/brand'
import { absoluteUrl } from '../../site/config'
import { breadcrumb, pageHead } from '../../site/seo'

const OG_IMAGE = '/og/guide.jpg'

export const Route = createFileRoute('/guide/')({
  head: () =>
    pageHead({ path: '/guide', title: GUIDE_COPY.metaTitle, description: GUIDE_COPY.description, ogImage: OG_IMAGE, pieceFont: true }, [
      breadcrumb([
        { name: SITE_NAME, path: '/' },
        { name: GUIDE_COPY.h1, path: '/guide' },
      ]),
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: GUIDE_COPY.h1,
        itemListElement: CHAPTERS.map((c) => ({
          '@type': 'ListItem',
          position: c.order,
          name: c.title,
          url: absoluteUrl(`/guide/${c.slug}`),
        })),
      },
    ]),
  component: GuideIndex,
})

function GuideIndex() {
  return (
    <main className="site-page guide-index">
      <h1>{GUIDE_COPY.h1}</h1>
      <p className="guide-lead">{GUIDE_COPY.lead}</p>
      <ol className="guide-cards">
        {CHAPTERS.map((c) => (
          <li key={c.slug}>
            <Link to="/guide/$slug" params={{ slug: c.slug }} className="guide-card">
              <span className="guide-card-figure" aria-hidden="true">
                <BoardDiagram diagram={{ ...c.hero, caption: '', alt: '' }} />
              </span>
              <span className="guide-card-body">
                <span className="guide-card-no">第{c.order}章</span>
                <span className="guide-card-title">{c.navTitle}</span>
                <span className="guide-card-summary">{c.summary}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <p>
        ルールを覚えたら、<Link to="/">AIと対局</Link>で実際に指してみましょう。いちばんやさしい「入門」から始められます。
      </p>
    </main>
  )
}
