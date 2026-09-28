// SPDX-License-Identifier: GPL-3.0-only

// A static board figure for the rules guide: plain SVG rendered on the
// server, readable without JavaScript. Pieces use the self-hosted piece
// font (its subset covers every piece glyph); coordinates and captions use
// the system font. Crosses and arrows are drawn as shapes.

import { useId } from 'react'

import { parseToken, square } from './diagram'
import type { Diagram } from './diagram'

const U = 40
const TOP = 22
const RIGHT = 22
const PAD = 6
const RANK_KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九']

function pentagon(cx: number, cy: number, size: number): string {
  const w = size * 0.84
  const h = size
  const pts: [number, number][] = [
    [0, -0.5],
    [0.36, -0.36],
    [0.44, 0.5],
    [-0.44, 0.5],
    [-0.36, -0.36],
  ]
  return pts.map(([x, y]) => `${(cx + x * w).toFixed(1)},${(cy + y * h).toFixed(1)}`).join(' ')
}

export function BoardDiagram({ diagram }: { diagram: Diagram }) {
  const markerId = useId()
  const files = diagram.crop?.files ?? [9, 1]
  const ranks = diagram.crop?.ranks ?? [1, 9]
  const x0 = 9 - Math.max(files[0], files[1])
  const x1 = 9 - Math.min(files[0], files[1])
  const y0 = Math.min(ranks[0], ranks[1]) - 1
  const y1 = Math.max(ranks[0], ranks[1]) - 1
  const cols = x1 - x0 + 1
  const rows = y1 - y0 + 1
  const width = PAD + cols * U + RIGHT
  const height = TOP + rows * U + PAD
  const inView = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1
  const cx = (x: number) => PAD + (x - x0 + 0.5) * U
  const cy = (y: number) => TOP + (y - y0 + 0.5) * U

  const marks = (diagram.marks ?? []).map((m) => ({ ...m, ...square(m.sq) })).filter((m) => inView(m.x, m.y))
  const pieces = Object.entries(diagram.pieces)
    .map(([sq, token]) => ({ ...square(sq), ...parseToken(token), sq }))
    .filter((p) => inView(p.x, p.y))

  return (
    <figure className="diagram">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={diagram.alt}
        className="diagram-board"
      >
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 Z" className="diagram-arrowhead" />
          </marker>
        </defs>

        {/* file numbers (9 … 1) and ranks (一 … 九) */}
        {Array.from({ length: cols }, (_, i) => (
          <text key={`f${i}`} x={cx(x0 + i)} y={TOP - 7} className="diagram-coord" textAnchor="middle">
            {9 - (x0 + i)}
          </text>
        ))}
        {Array.from({ length: rows }, (_, i) => (
          <text key={`r${i}`} x={PAD + cols * U + RIGHT / 2} y={cy(y0 + i) + 4} className="diagram-coord" textAnchor="middle">
            {RANK_KANJI[y0 + i]}
          </text>
        ))}

        <rect x={PAD} y={TOP} width={cols * U} height={rows * U} className="diagram-wood" />
        {Array.from({ length: cols + 1 }, (_, i) => (
          <line key={`v${i}`} x1={PAD + i * U} y1={TOP} x2={PAD + i * U} y2={TOP + rows * U} className="diagram-grid" />
        ))}
        {Array.from({ length: rows + 1 }, (_, i) => (
          <line key={`h${i}`} x1={PAD} y1={TOP + i * U} x2={PAD + cols * U} y2={TOP + i * U} className="diagram-grid" />
        ))}
        {/* star points at the corners of the central 3×3 */}
        {[3, 6].flatMap((sx) =>
          [3, 6].map((sy) =>
            sx > x0 && sx <= x1 && sy > y0 && sy <= y1 ? (
              <circle key={`s${sx}${sy}`} cx={PAD + (sx - x0) * U} cy={TOP + (sy - y0) * U} r={2.6} className="diagram-star" />
            ) : null,
          ),
        )}

        {marks
          .filter((m) => m.kind === 'target')
          .map((m) => (
            <rect key={`t${m.sq}`} x={cx(m.x) - U / 2 + 1} y={cy(m.y) - U / 2 + 1} width={U - 2} height={U - 2} className="diagram-target" />
          ))}

        {pieces.map((p) => (
          <g key={p.sq} transform={p.owner === 'gote' ? `rotate(180 ${cx(p.x)} ${cy(p.y)})` : undefined}>
            <polygon points={pentagon(cx(p.x), cy(p.y), U * 0.86)} className="diagram-piece" />
            <text x={cx(p.x)} y={cy(p.y) + 9} textAnchor="middle" className={`diagram-glyph ${p.type.startsWith('+') ? 'diagram-glyph-promoted' : ''}`}>
              {p.glyph}
            </text>
          </g>
        ))}

        {marks
          .filter((m) => m.kind === 'move')
          .map((m) => (
            <circle key={`m${m.sq}`} cx={cx(m.x)} cy={cy(m.y)} r={U * 0.14} className="diagram-dot" />
          ))}
        {marks
          .filter((m) => m.kind === 'bad')
          .map((m) => {
            const r = U * 0.26
            return (
              <path
                key={`b${m.sq}`}
                d={`M${cx(m.x) - r} ${cy(m.y) - r} L${cx(m.x) + r} ${cy(m.y) + r} M${cx(m.x) + r} ${cy(m.y) - r} L${cx(m.x) - r} ${cy(m.y) + r}`}
                className="diagram-bad"
              />
            )
          })}

        {(diagram.arrows ?? []).map((a) => {
          const f = square(a.from)
          const t = square(a.to)
          const dx = cx(t.x) - cx(f.x)
          const dy = cy(t.y) - cy(f.y)
          const len = Math.hypot(dx, dy) || 1
          const trim = U * 0.3
          return (
            <line
              key={`a${a.from}${a.to}`}
              x1={cx(f.x) + (dx / len) * trim}
              y1={cy(f.y) + (dy / len) * trim}
              x2={cx(t.x) - (dx / len) * trim}
              y2={cy(t.y) - (dy / len) * trim}
              className="diagram-arrow"
              markerEnd={`url(#${markerId})`}
            />
          )
        })}
      </svg>
      {diagram.hands && (
        <p className="diagram-hands">
          {diagram.hands.gote !== undefined && <span>△後手の持ち駒：{diagram.hands.gote || 'なし'}</span>}
          {diagram.hands.sente !== undefined && <span>▲先手の持ち駒：{diagram.hands.sente || 'なし'}</span>}
        </p>
      )}
      <figcaption>{diagram.caption}</figcaption>
    </figure>
  )
}
