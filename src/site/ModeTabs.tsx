// SPDX-License-Identifier: GPL-3.0-only

import { Link } from '@tanstack/react-router'

/** Real links between the game modes (each mode is its own page). */
export function ModeTabs({ current }: { current: 'ai' | 'online' | 'board' }) {
  return (
    <nav className="mode-tabs" aria-label="対局の種類">
      <Link to="/" className="mode-tab" aria-current={current === 'ai' ? 'page' : undefined}>
        AIと対局
      </Link>
      <Link to="/online" className="mode-tab" aria-current={current === 'online' ? 'page' : undefined}>
        だれかと対局
      </Link>
      <Link to="/board" className="mode-tab" aria-current={current === 'board' ? 'page' : undefined}>
        将棋盤
      </Link>
    </nav>
  )
}
