// SPDX-License-Identifier: GPL-3.0-only

import { RANKS } from '../../../../online/rating'

export function rankLabel(rank: number | null | undefined): string | null {
  return typeof rank === 'number' && RANKS[rank] ? RANKS[rank].label : null
}

/** 段級位 as a small pill, coloured by tier (白木・青銅・銀・金・紫檀). */
export function RankBadge({ rank }: { rank: number | null | undefined }) {
  const label = rankLabel(rank)
  if (!label || typeof rank !== 'number') return null
  return <span className={`rank-badge rank-tier-${RANKS[rank].tier}`}>{label}</span>
}
