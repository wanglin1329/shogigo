// SPDX-License-Identifier: GPL-3.0-only

/**
 * A finger that taps ７七 and then ７六 (docs/PLAN.md §5.3-8). Drawn inside
 * the board grid (sente at the bottom), so cell percentages are exact.
 * The animation itself is CSS; the component only positions it.
 */
export function FirstMoveDemo({ text }: { text: string }) {
  // ７七 = x 2, y 6 → ７六 = x 2, y 5 (screen = board when sente is at the bottom).
  return (
    <div className="demo-layer" aria-hidden="true">
      <span className="demo-ring demo-ring-from" />
      <span className="demo-ring demo-ring-to" />
      <span className="demo-finger">
        <svg viewBox="0 0 24 24" width="100%" height="100%">
          <path
            d="M9 11V4.5a1.5 1.5 0 0 1 3 0V10l.5-.1a1.5 1.5 0 0 1 2.5 1v.4l.4-.1a1.5 1.5 0 0 1 2.1 1.2l.1.7a1.5 1.5 0 0 1 2.4 1.2v2.3c0 3-2.4 5.4-5.4 5.4h-2.2a5.4 5.4 0 0 1-4.4-2.3l-2.7-3.9a1.5 1.5 0 0 1 2.2-2l1.5 1.3z"
            fill="#fff"
            stroke="#22262e"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="demo-caption">{text}</span>
    </div>
  )
}
