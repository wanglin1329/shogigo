// SPDX-License-Identifier: GPL-3.0-only

import { Link } from '@tanstack/react-router'

import { SITE_NAME } from './brand'
import { CONTACT_EMAIL, SOURCE_URL } from './config'

/** The brand mark: a shogi piece (pentagon) with 将. Same drawing as public/favicon.svg. */
export function PieceMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="piece-mark" width={size * (24 / 28)} height={size} viewBox="0 0 24 28" aria-hidden="true">
      <path d="M12 1.5 L20.6 5.2 L22.6 26.5 L1.4 26.5 L3.4 5.2 Z" fill="#ecca8e" stroke="#7a5a33" strokeWidth="1.5" strokeLinejoin="round" />
      <text x="12" y="20.5" textAnchor="middle" fontSize="12" fontWeight="700" fill="#22262e" fontFamily="'Hiragino Mincho ProN','Yu Mincho',serif">
        将
      </text>
    </svg>
  )
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link to="/" className="site-logo" aria-label={`${SITE_NAME}（トップページ）`}>
        <PieceMark />
        <span className="site-logo-text">
          shogi<span className="site-logo-go">go</span>
        </span>
      </Link>
      <nav className="site-header-nav" aria-label="サイト">
        <Link to="/guide" className="site-header-link" activeProps={{ 'aria-current': 'page' }}>
          ルール
        </Link>
        <Link to="/records" className="site-header-link" activeProps={{ 'aria-current': 'page' }}>
          戦績
        </Link>
      </nav>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav className="site-footer-nav" aria-label="サイト情報">
        <Link to="/about">運営者情報</Link>
        <Link to="/privacy">プライバシーポリシー</Link>
        <Link to="/terms">利用規約</Link>
        {CONTACT_EMAIL && <Link to="/contact">お問い合わせ</Link>}
        <Link to="/license">ライセンス・ソースコード</Link>
        <a href={SOURCE_URL} rel="noopener">
          GitHub
        </a>
      </nav>
      <p className="site-footer-copy">© 2026 {SITE_NAME}</p>
    </footer>
  )
}
