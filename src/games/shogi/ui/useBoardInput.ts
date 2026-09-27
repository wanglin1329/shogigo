// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useMemo, useState } from 'react'
import type { PointerEvent } from 'react'

import type { BasePieceType, GameState, Move } from '../core/engine'
import {
  canPromote,
  explainNoDrops,
  explainNoMoves,
  explainRejectedDrop,
  explainRejectedMove,
  legalDrops,
  legalTargets,
  movablePieces,
  mustPromote,
} from '../core/hints'
import type { Refusal, Square } from '../core/hints'
import { refusalText } from './messages'
import { usePieceDrag } from './usePieceDrag'

export type Selection = { kind: 'board'; square: Square } | { kind: 'hand'; type: BasePieceType }

const HINT_MS = 4000
let seq = 0

/**
 * Everything between "the player touches the board" and "a legal Move":
 * tap/drag selection, promotion choice, and the explanation bubble when a
 * move is refused (docs/PLAN.md §5.3-4, -6, -7). Used by every game mode;
 * what happens with the Move is up to the caller.
 */
export function useBoardInput(options: {
  state: GameState
  /** The player may move now (their turn, nothing pending). */
  interactive: boolean
  /** Show the refusal bubble (the shake always plays). */
  moveHints: boolean
  onMove: (move: Move) => void
  /** Tap while not interactive (e.g. to explain whose turn it is). */
  onBlockedTap?: (square: Square) => void
  /** Tap on nothing selectable while nothing is selected. */
  onDeadTap?: (square: Square) => void
}) {
  const { state, interactive, moveHints } = options
  const [selection, setSelection] = useState<Selection | null>(null)
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null)
  const [hint, setHint] = useState<{ text: string; cells: Square[]; id: number } | null>(null)
  const [shake, setShake] = useState<{ square: Square; id: number } | null>(null)

  useEffect(() => {
    if (!hint) return
    const t = setTimeout(() => setHint(null), HINT_MS)
    return () => clearTimeout(t)
  }, [hint])

  // A new position (move, undo, remote update) invalidates any half-made move.
  useEffect(() => {
    setSelection(null)
    setPromotion(null)
  }, [state])

  function clear() {
    setSelection(null)
    setPromotion(null)
    setHint(null)
  }

  function emit(move: Move) {
    clear()
    options.onMove(move)
  }

  function refuse(refusal: Refusal, moving: Parameters<typeof refusalText>[2], at: Square | null) {
    if (at) setShake({ square: at, id: ++seq })
    if (!moveHints) return
    const text = refusalText(refusal, state.board, moving)
    if (text) setHint({ text, cells: refusal.cells, id: ++seq })
  }

  function trySelectBoard(square: Square): boolean {
    const piece = state.board[square.y][square.x]
    if (!piece || piece.owner !== state.currentPlayer) return false
    if (legalTargets(state, square).length === 0) {
      refuse(explainNoMoves(state, square), piece.type, square)
      setSelection(null)
      return true
    }
    setSelection({ kind: 'board', square })
    setHint(null)
    return true
  }

  function moveTo(source: Selection, target: Square) {
    if (source.kind === 'hand') {
      if (legalDrops(state, source.type).some((s) => s.x === target.x && s.y === target.y)) {
        emit({ type: 'drop', pieceType: source.type, toX: target.x, toY: target.y })
      } else {
        refuse(explainRejectedDrop(state, source.type, target), source.type, target)
        setSelection(null)
      }
      return
    }
    const from = source.square
    const piece = state.board[from.y][from.x]
    if (!piece) return
    if (!legalTargets(state, from).some((s) => s.x === target.x && s.y === target.y)) {
      refuse(explainRejectedMove(state, from, target), piece.type, target)
      setSelection(null)
      return
    }
    const base = { type: 'move' as const, fromX: from.x, fromY: from.y, toX: target.x, toY: target.y }
    if (mustPromote(piece, target.y)) emit({ ...base, promote: true })
    else if (canPromote(piece, from.y, target.y)) setPromotion({ from, to: target })
    else emit({ ...base, promote: false })
  }

  function onSquare(square: Square) {
    if (promotion) return
    if (!interactive) {
      options.onBlockedTap?.(square)
      return
    }
    if (selection) {
      if (selection.kind === 'board' && selection.square.x === square.x && selection.square.y === square.y) {
        setSelection(null)
        return
      }
      const piece = state.board[square.y][square.x]
      // Tapping another own piece switches the selection instead of refusing.
      if (piece && piece.owner === state.currentPlayer && trySelectBoard(square)) return
      moveTo(selection, square)
      return
    }
    if (!trySelectBoard(square)) options.onDeadTap?.(square)
  }

  function selectHand(type: BasePieceType) {
    if (!interactive) return
    if (selection?.kind === 'hand' && selection.type === type) {
      setSelection(null)
      return
    }
    if (legalDrops(state, type).length === 0) {
      refuse(explainNoDrops(state), type, null)
      return
    }
    setSelection({ kind: 'hand', type })
    setHint(null)
  }

  const drag = usePieceDrag<Selection>({
    onStart: (source) => {
      if (!interactive) return false
      if (source.kind === 'board') return trySelectBoard(source.square) && legalTargets(state, source.square).length > 0
      if (legalDrops(state, source.type).length === 0) return false
      setSelection(source)
      return true
    },
    onDrop: (source, target) => {
      if (!target) {
        setSelection(null)
        return
      }
      if (source.kind === 'board' && source.square.x === target.x && source.square.y === target.y) return
      // The source comes from the drag itself: `selection` may not be committed yet.
      moveTo(source, target)
    },
    onCancel: () => setSelection(null),
  })

  function choosePromotion(promote: boolean) {
    if (!promotion) return
    const { from, to } = promotion
    emit({ type: 'move', fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, promote })
  }

  const movable = useMemo(() => (interactive && !selection ? movablePieces(state) : []), [interactive, selection, state])
  const targets = useMemo(() => {
    if (!selection || !interactive) return []
    return selection.kind === 'board' ? legalTargets(state, selection.square) : legalDrops(state, selection.type)
  }, [selection, interactive, state])

  return {
    selection,
    promotion,
    hint,
    shake,
    movable,
    targets,
    onSquare,
    selectHand,
    armBoard: (square: Square, e: PointerEvent<HTMLElement>) => drag.arm({ kind: 'board', square }, e),
    armHand: (type: BasePieceType, e: PointerEvent<HTMLElement>) => drag.arm({ kind: 'hand', type }, e),
    ghost: drag.ghost,
    choosePromotion,
    cancelPromotion: () => {
      setPromotion(null)
      setSelection(null)
    },
    clear,
  }
}

export type BoardInput = ReturnType<typeof useBoardInput>
