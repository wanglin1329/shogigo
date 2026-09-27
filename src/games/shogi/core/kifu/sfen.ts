// SPDX-License-Identifier: GPL-3.0-only

// SFEN（USI の局面表記）と GameState の相互変換。
// 対局の基準は { initialSfen, moves }（docs/PLAN.md §2.4）。initialSfen が null なら平手。
//
// 方針:
// - 形の壊れた SFEN は SfenError を投げる。URL・貼り付けなど外から来る文字列は、
//   受け取った場所で捕まえて利用者向けの文言に直す。
// - 玉は無くてもよい（詰将棋の局面は攻め方の玉を置かないのが普通）。1枚を超えると不正。
// - 実戦で起こりえない局面（駒の数が多すぎる・行き所のない駒・二歩・手番でない側が
//   王手されている）は不正として断る。エンジンが前提にしている形だけを通すため。

import {
  BISHOP,
  CAPTURED_ORDER,
  GOLD,
  GOTE,
  KING,
  KNIGHT,
  LANCE,
  PAWN,
  ROOK,
  SENTE,
  SILVER,
  createInitialGameState,
  getBoardHash,
  getOpponent,
  isKingInCheck,
  pieceInfo,
  type BasePieceType,
  type Board,
  type Captured,
  type CapturedPieces,
  type GameState,
  type PieceType,
  type Player,
} from '../engine'

export const HIRATE_SFEN = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1'

export class SfenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SfenError'
  }
}

const LETTER_TO_BASE: Record<string, BasePieceType | typeof KING> = {
  K: KING,
  R: ROOK,
  B: BISHOP,
  G: GOLD,
  S: SILVER,
  N: KNIGHT,
  L: LANCE,
  P: PAWN,
}

const BASE_TO_LETTER: Record<string, string> = {
  [KING]: 'K',
  [ROOK]: 'R',
  [BISHOP]: 'B',
  [GOLD]: 'G',
  [SILVER]: 'S',
  [KNIGHT]: 'N',
  [LANCE]: 'L',
  [PAWN]: 'P',
}

/** 1局に存在する駒の枚数（両者合計） */
const PIECE_LIMITS: Record<BasePieceType | typeof KING, number> = {
  [KING]: 2,
  [ROOK]: 2,
  [BISHOP]: 2,
  [GOLD]: 4,
  [SILVER]: 4,
  [KNIGHT]: 4,
  [LANCE]: 4,
  [PAWN]: 18,
}

function emptyCaptured(): Captured {
  return { HI: 0, KA: 0, KI: 0, GI: 0, KE: 0, KY: 0, FU: 0 }
}

function baseOf(type: PieceType): BasePieceType | typeof KING {
  return (pieceInfo[type].base ?? type) as BasePieceType | typeof KING
}

function parseBoard(text: string): Board {
  const ranks = text.split('/')
  if (ranks.length !== 9) throw new SfenError('盤面の段数が9ではありません')
  const board: Board = []
  ranks.forEach((rankText, y) => {
    const row: Board[number] = []
    let promoted = false
    for (const ch of rankText) {
      if (ch === '+') {
        if (promoted) throw new SfenError(`${y + 1}段目の「+」が続いています`)
        promoted = true
        continue
      }
      if (ch >= '1' && ch <= '9') {
        if (promoted) throw new SfenError(`${y + 1}段目の「+」の後に駒がありません`)
        for (let i = 0; i < Number(ch); i++) row.push(null)
        continue
      }
      const base = LETTER_TO_BASE[ch.toUpperCase()]
      if (!base) throw new SfenError(`駒の文字「${ch}」を読み取れません`)
      const owner: Player = ch === ch.toUpperCase() ? SENTE : GOTE
      let type: PieceType = base
      if (promoted) {
        const target = pieceInfo[base].promoted
        if (!target) throw new SfenError(`成れない駒「${ch}」に「+」が付いています`)
        type = target
        promoted = false
      }
      row.push({ type, owner })
    }
    if (promoted) throw new SfenError(`${y + 1}段目の末尾に「+」があります`)
    if (row.length !== 9) throw new SfenError(`${y + 1}段目のマス数が9ではありません`)
    board.push(row)
  })
  return board
}

function parseHands(text: string): CapturedPieces {
  const hands: CapturedPieces = { [SENTE]: emptyCaptured(), [GOTE]: emptyCaptured() }
  if (text === '-') return hands
  const re = /(\d*)([RBGSNLPrbgsnlp])/y
  let index = 0
  while (index < text.length) {
    re.lastIndex = index
    const match = re.exec(text)
    if (!match) throw new SfenError(`持ち駒「${text}」を読み取れません`)
    const count = match[1] === '' ? 1 : Number(match[1])
    if (!Number.isInteger(count) || count < 1) throw new SfenError(`持ち駒の枚数「${match[1]}」が不正です`)
    const owner: Player = match[2] === match[2].toUpperCase() ? SENTE : GOTE
    const base = LETTER_TO_BASE[match[2].toUpperCase()] as BasePieceType
    hands[owner][base] += count
    index = re.lastIndex
  }
  return hands
}

function validate(board: Board, hands: CapturedPieces, sideToMove: Player): void {
  const totals: Record<string, number> = {}
  const kings: Record<Player, number> = { [SENTE]: 0, [GOTE]: 0 }
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const piece = board[y][x]
      if (!piece) continue
      const base = baseOf(piece.type)
      totals[base] = (totals[base] ?? 0) + 1
      if (piece.type === KING) kings[piece.owner]++
      // 行き所のない駒（成っていない歩・香・桂が奥に居る）
      const depth = piece.owner === SENTE ? y : 8 - y
      if ((piece.type === PAWN || piece.type === LANCE) && depth === 0) {
        throw new SfenError('行き所のない歩・香があります')
      }
      if (piece.type === KNIGHT && depth <= 1) throw new SfenError('行き所のない桂があります')
    }
  }
  if (kings[SENTE] > 1 || kings[GOTE] > 1) throw new SfenError('玉が2枚以上あります')
  for (const owner of [SENTE, GOTE] as const) {
    for (const base of CAPTURED_ORDER) totals[base] = (totals[base] ?? 0) + hands[owner][base]
  }
  for (const [base, limit] of Object.entries(PIECE_LIMITS)) {
    if ((totals[base] ?? 0) > limit) throw new SfenError('駒の数が多すぎます')
  }
  for (const owner of [SENTE, GOTE] as const) {
    for (let x = 0; x < 9; x++) {
      let pawns = 0
      for (let y = 0; y < 9; y++) {
        const piece = board[y][x]
        if (piece && piece.owner === owner && piece.type === PAWN) pawns++
      }
      if (pawns > 1) throw new SfenError('二歩になっています')
    }
  }
  if (isKingInCheck(getOpponent(sideToMove), board)) {
    throw new SfenError('手番でない側の玉に王手がかかっています')
  }
}

/**
 * SFEN を GameState にする。手数（4番目の欄）は省略可（1手目とみなす）。
 * positionHistory などの履歴は createInitialGameState と同じ形で、開始局面1つぶんから始まる
 * （その局面からの千日手をそのまま数えられるように）。
 */
export function parseSfen(sfen: string): GameState {
  if (typeof sfen !== 'string') throw new SfenError('SFEN が文字列ではありません')
  const fields = sfen.trim().split(/\s+/)
  if (fields.length < 3 || fields.length > 4) throw new SfenError('SFEN の欄の数が合いません')
  const [boardText, sideText, handText, moveText = '1'] = fields
  if (sideText !== 'b' && sideText !== 'w') throw new SfenError(`手番「${sideText}」を読み取れません`)
  if (!/^[1-9]\d*$/.test(moveText)) throw new SfenError(`手数「${moveText}」を読み取れません`)

  const board = parseBoard(boardText)
  const capturedPieces = parseHands(handText)
  const currentPlayer: Player = sideText === 'b' ? SENTE : GOTE
  validate(board, capturedPieces, currentPlayer)

  const isCheck = isKingInCheck(currentPlayer, board)
  return {
    board,
    capturedPieces,
    currentPlayer,
    moveCount: Number(moveText) - 1,
    lastMove: null,
    isCheck,
    positionHistory: [getBoardHash(board, capturedPieces, currentPlayer)],
    checkHistory: [isCheck],
    turnHistory: [currentPlayer],
    usiMoveHistory: [],
  }
}

/** GameState を SFEN にする。手数は既定で state.moveCount + 1（次に指す手の番号） */
export function toSfen(state: Pick<GameState, 'board' | 'capturedPieces' | 'currentPlayer' | 'moveCount'>, moveNumber = state.moveCount + 1): string {
  const ranks = state.board.map((row) => {
    let out = ''
    let empty = 0
    for (const piece of row) {
      if (!piece) {
        empty++
        continue
      }
      if (empty > 0) {
        out += String(empty)
        empty = 0
      }
      const base = baseOf(piece.type)
      const letter = BASE_TO_LETTER[base]
      out += (piece.type !== base ? '+' : '') + (piece.owner === SENTE ? letter : letter.toLowerCase())
    }
    if (empty > 0) out += String(empty)
    return out
  })

  let hands = ''
  for (const owner of [SENTE, GOTE] as const) {
    for (const base of CAPTURED_ORDER) {
      const count = state.capturedPieces[owner][base]
      if (count <= 0) continue
      const letter = BASE_TO_LETTER[base]
      hands += (count > 1 ? String(count) : '') + (owner === SENTE ? letter : letter.toLowerCase())
    }
  }

  return `${ranks.join('/')} ${state.currentPlayer === SENTE ? 'b' : 'w'} ${hands || '-'} ${moveNumber}`
}

/**
 * 開始局面を正規化する。平手（手数1）なら null、それ以外は書式を揃えた SFEN。
 * 形が壊れていれば SfenError。比較・保存・URL は必ずこれを通した値を使う。
 */
export function normalizeInitialSfen(initialSfen: string | null | undefined): string | null {
  if (initialSfen === null || initialSfen === undefined) return null
  const canonical = toSfen(parseSfen(initialSfen))
  return canonical === HIRATE_SFEN ? null : canonical
}

/** 平手の初形（手数1）か。読めない SFEN は false */
export function isHirateSfen(sfen: string): boolean {
  try {
    return normalizeInitialSfen(sfen) === null
  } catch {
    return false
  }
}

/** 対局の開始局面。null は平手 */
export function createGameState(initialSfen: string | null): GameState {
  return initialSfen === null ? createInitialGameState() : parseSfen(initialSfen)
}
