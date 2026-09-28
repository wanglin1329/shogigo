// SPDX-License-Identifier: GPL-3.0-only

import { Link } from '@tanstack/react-router'

import { japaneseDate } from '../lastmod'
import { BoardDiagram } from './BoardDiagram'
import { neighbours } from './chapters'
import { Rich } from './Rich'
import type { Block, Chapter } from './types'

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'p':
      return (
        <p>
          <Rich text={block.text} />
        </p>
      )
    case 'list':
      return (
        <ul>
          {block.items.map((item) => (
            <li key={item}>
              <Rich text={item} />
            </li>
          ))}
        </ul>
      )
    case 'figures':
      return block.diagrams.length === 1 ? (
        <BoardDiagram diagram={block.diagrams[0]} />
      ) : (
        <div className="diagram-row">
          {block.diagrams.map((d) => (
            <BoardDiagram key={d.caption} diagram={d} />
          ))}
        </div>
      )
    case 'table':
      return (
        <div className="table-scroll">
          <table>
            {block.caption && <caption>{block.caption}</caption>}
            <thead>
              <tr>
                {block.head.map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, i) =>
                    i === 0 ? (
                      <th key={i} scope="row">
                        <Rich text={cell} />
                      </th>
                    ) : (
                      <td key={i}>
                        <Rich text={cell} />
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'note':
      return (
        <aside className="guide-note">
          <strong>{block.title}</strong>
          <p>
            <Rich text={block.text} />
          </p>
        </aside>
      )
  }
}

export function GuideArticle({ chapter }: { chapter: Chapter }) {
  const { prev, next } = neighbours(chapter.slug)
  return (
    <main className="site-page guide-article">
      <nav className="guide-crumbs" aria-label="パンくずリスト">
        <Link to="/guide">将棋のルール入門</Link>
        <span aria-hidden="true"> › </span>
        <span>第{chapter.order}章</span>
      </nav>
      <h1>{chapter.title}</h1>
      <p className="guide-lead">{chapter.lead}</p>

      <nav className="guide-toc" aria-label="この章の目次">
        <ol>
          {chapter.sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`}>{s.heading}</a>
            </li>
          ))}
        </ol>
      </nav>

      {chapter.sections.map((s) => (
        <section key={s.id} aria-labelledby={s.id}>
          <h2 id={s.id}>{s.heading}</h2>
          {s.blocks.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </section>
      ))}

      <section className="guide-takeaway" aria-labelledby="takeaway">
        <h2 id="takeaway">この章のまとめ</h2>
        <ul>
          {chapter.takeaway.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      <nav className="guide-pager" aria-label="前後の章">
        {prev ? (
          <Link to="/guide/$slug" params={{ slug: prev.slug }} className="guide-pager-prev">
            <span>前の章</span>
            {prev.navTitle}
          </Link>
        ) : (
          <Link to="/guide" className="guide-pager-prev">
            <span>目次へ</span>
            ルール入門
          </Link>
        )}
        {next ? (
          <Link to="/guide/$slug" params={{ slug: next.slug }} className="guide-pager-next">
            <span>次の章</span>
            {next.navTitle}
          </Link>
        ) : (
          <Link to="/" className="guide-pager-next">
            <span>覚えたら</span>
            AIと対局する
          </Link>
        )}
      </nav>

      <aside className="guide-cta">
        <p>読んだルールは、実際に指すといちばん早く身につきます。</p>
        <Link to="/" className="btn btn-primary">
          AIと対局してみる
        </Link>
      </aside>

      <p className="updated">最終更新日：{japaneseDate(chapter.updatedAt)}</p>
    </main>
  )
}
