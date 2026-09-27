// SPDX-License-Identifier: GPL-3.0-only

import { Link } from '@tanstack/react-router'

import type { WazaSummaryEntry } from '../core/waza/index'
import type { SaveStatus } from '../records'
import { WAZA_COPY } from './waza-copy'

/** The waza of this game, for the result dialogs. */
export function WazaList({ entries }: { entries: readonly WazaSummaryEntry[] }) {
  if (entries.length === 0) return null
  return (
    <div className="result-waza">
      <span className="result-waza-caption">この対局で出た技</span>
      <ul className="waza-list">
        {entries.map((e) => (
          <li key={e.id} className="waza-chip">
            {WAZA_COPY[e.id].name}
            {e.count > 1 && `×${e.count}`}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Whether the game made it into 対局記録 (with 「再試行」 when it did not). */
export function RecordSaveNote({ status, onRetry }: { status: SaveStatus | null; onRetry: () => void }) {
  if (!status || status.status === 'unavailable') return null
  if (status.status === 'failed') {
    return (
      <p className="result-note result-save" role="alert">
        対局記録に保存できませんでした
        <button type="button" className="chip" onClick={onRetry}>
          再試行
        </button>
      </p>
    )
  }
  return (
    <p className="result-note result-save">
      対局記録に保存しました・
      <Link to="/records">記録を見る</Link>
    </p>
  )
}
