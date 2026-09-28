import { createFileRoute, notFound } from '@tanstack/react-router'

import { getChapter } from '../../content/guide/chapters'
import { GuideArticle } from '../../content/guide/GuideArticle'
import { GUIDE_COPY } from '../../content/guide'
import { OPERATOR, SITE_NAME } from '../../site/brand'
import { absoluteUrl } from '../../site/config'
import { breadcrumb, pageHead } from '../../site/seo'

const OG_IMAGE = '/og/guide.jpg'

export const Route = createFileRoute('/guide/$slug')({
  loader: ({ params }) => {
    const chapter = getChapter(params.slug)
    if (!chapter) throw notFound()
    return { slug: chapter.slug }
  },
  head: ({ loaderData }) => {
    const chapter = loaderData ? getChapter(loaderData.slug) : undefined
    if (!chapter) return {}
    const path = `/guide/${chapter.slug}`
    return pageHead(
      { path, title: chapter.metaTitle, description: chapter.description, ogImage: OG_IMAGE, ogType: 'article', pieceFont: true },
      [
        breadcrumb([
          { name: SITE_NAME, path: '/' },
          { name: GUIDE_COPY.h1, path: '/guide' },
          { name: chapter.title, path },
        ]),
        {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: chapter.title,
          description: chapter.description,
          dateModified: chapter.updatedAt,
          inLanguage: 'ja',
          image: absoluteUrl(OG_IMAGE),
          mainEntityOfPage: absoluteUrl(path),
          author: { '@type': 'Organization', name: OPERATOR, url: absoluteUrl('/') },
          publisher: { '@type': 'Organization', name: OPERATOR, logo: { '@type': 'ImageObject', url: absoluteUrl('/logo-512.png') } },
        },
      ],
    )
  },
  component: Chapter,
})

function Chapter() {
  const { slug } = Route.useLoaderData()
  return <GuideArticle chapter={getChapter(slug)!} />
}
