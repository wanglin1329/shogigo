// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2025~ Yuki Lab
// Copyright 2026 the shogi project contributors
// Modified 2026-09-27: games may start from any position (initialSfen, docs/PLAN.md §2.4):
// KIF export/import of BOD 局面図, USI `position sfen …` / bare SFEN import, USI export,
// ParsedKifu.initialSfen; import paths adapted.

// 棋譜の書き出し（KIF / USI）と読み込み（KIF / USI・SFEN）。
//
// 🔴 開始局面は平手か、局面図（BOD）/ SFEN で与えられた局面。手合割の名前だけで
//    盤を指定する駒落ち（局面図なし）は断る。
// 🔴 KI2・CSA は移動元が書かれておらず、推測すると別の棋譜になるので断る（理由を出す）。
// 🔴 黙って失敗しないこと。読めないときは必ず理由を返す。

import {
  BISHOP,
  CAPTURED_ORDER,
  GOLD,
  GOTE,
  KING,
  KNIGHT,
  LANCE,
  PAWN,
  PROMOTED_BISHOP,
  PROMOTED_KNIGHT,
  PROMOTED_LANCE,
  PROMOTED_PAWN,
  PROMOTED_ROOK,
  PROMOTED_SILVER,
  ROOK,
  SENTE,
  SILVER,
  type BasePieceType,
  type GameState,
  type PieceType,
  type Player,
} from '../engine'
import { formatUsiMove, isBaseDropType, isUsiMoveToken } from './moves'
import { KIFU_PIECE_NAMES, buildNotation } from './notation'
import { replayUsiMoves } from './replay'
import { HIRATE_SFEN, SfenError, normalizeInitialSfen, parseSfen, toSfen } from './sfen'

export { HIRATE_SFEN }

const CRLF = '\r\n'

// ---------------------------------------------------------------- 書き出し

export type KifExportOptions = {
  senteName?: string
  goteName?: string
  /** 開始日時。持っていないので、ふつうは書き出した時刻を渡す */
  date?: Date
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function formatStartDate(date: Date): string {
  return (
    `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())} ` +
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
  )
}

// 消費時間は持っていないので1手1秒の固定値。( 0:01/00:00:03) の形
function formatSpent(ply: number): string {
  const total = Math.ceil(ply / 2)
  const hh = pad2(Math.floor(total / 3600))
  const mm = pad2(Math.floor((total % 3600) / 60))
  const ss = pad2(total % 60)
  return `( 0:01/${hh}:${mm}:${ss})`
}

// 局面図（BOD）で使う1文字の駒名
const BOD_PIECE: Record<PieceType, string> = {
  [KING]: '玉',
  [ROOK]: '飛',
  [BISHOP]: '角',
  [GOLD]: '金',
  [SILVER]: '銀',
  [KNIGHT]: '桂',
  [LANCE]: '香',
  [PAWN]: '歩',
  [PROMOTED_ROOK]: '龍',
  [PROMOTED_BISHOP]: '馬',
  [PROMOTED_SILVER]: '全',
  [PROMOTED_KNIGHT]: '圭',
  [PROMOTED_LANCE]: '杏',
  [PROMOTED_PAWN]: 'と',
}

const BOD_CHAR_TO_TYPE: Record<string, PieceType> = {
  ...Object.fromEntries(Object.entries(BOD_PIECE).map(([type, ch]) => [ch, type as PieceType])),
  王: KING,
  竜: PROMOTED_ROOK,
}

const KANJI_NUMBERS = ['', '', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八']
const FILE_HEADER = '  ９ ８ ７ ６ ５ ４ ３ ２ １'
const BOARD_EDGE = '+---------------------------+'
const RANK_KANJI = '一二三四五六七八九'

function formatHand(state: GameState, owner: Player): string {
  const parts: string[] = []
  for (const base of CAPTURED_ORDER) {
    const count = state.capturedPieces[owner][base]
    if (count > 0) parts.push(BOD_PIECE[base] + (KANJI_NUMBERS[count] ?? String(count)))
  }
  return parts.length ? parts.join('　') : 'なし'
}

function formatBod(state: GameState): string[] {
  const lines = [`後手の持駒：${formatHand(state, GOTE)}`, FILE_HEADER, BOARD_EDGE]
  state.board.forEach((row, y) => {
    const cells = row.map((piece) => (piece ? (piece.owner === GOTE ? 'v' : ' ') + BOD_PIECE[piece.type] : ' ・'))
    lines.push(`|${cells.join('')}|${RANK_KANJI[y]}`)
  })
  lines.push(BOARD_EDGE, `先手の持駒：${formatHand(state, SENTE)}`)
  if (state.currentPlayer === GOTE) lines.push('後手番')
  // 局面図までに指された手数（柿木形式の「手数＝N」）。SFEN の手数欄を往復させるため
  if (state.moveCount > 0) lines.push(`手数＝${state.moveCount}`)
  return lines
}

/**
 * 対局を KIF 形式の文字列にする。改行は慣例どおり CRLF。
 * 平手は「手合割：平手」、途中局面から始まる対局は局面図（BOD）を付ける。
 */
export function formatKif(
  initialSfen: string | null,
  usiMoves: readonly string[],
  options: KifExportOptions = {},
): string {
  const start = normalizeInitialSfen(initialSfen)
  const entries = buildNotation(start, usiMoves)
  const lines = [`開始日時：${formatStartDate(options.date ?? new Date())}`]
  if (start === null) lines.push('手合割：平手')
  else lines.push(...formatBod(parseSfen(start)))
  lines.push(
    `先手：${options.senteName ?? '先手'}`,
    `後手：${options.goteName ?? '後手'}`,
    '手数----指手---------消費時間--',
  )
  for (const entry of entries) {
    const number = String(entry.ply).padStart(4, ' ')
    lines.push(`${number} ${entry.kif.padEnd(13, ' ')}${formatSpent(entry.ply)}`)
  }
  return lines.join(CRLF) + CRLF
}

/** USI の position コマンドの形（エンジンに送るのと同じ）。平手は startpos */
export function formatUsiPosition(initialSfen: string | null, usiMoves: readonly string[]): string {
  const start = normalizeInitialSfen(initialSfen)
  const head = start === null ? 'position startpos' : `position sfen ${start}`
  return usiMoves.length ? `${head} moves ${usiMoves.join(' ')}` : head
}

// ---------------------------------------------------------------- 読み込み

export type KifuFormat = 'kif' | 'usi' | 'ki2' | 'csa' | 'unknown'

export type ParsedKifu =
  | {
      ok: true
      format: 'kif' | 'usi'
      formatLabel: string
      /** 開始局面（正規化済み）。null は平手 */
      initialSfen: string | null
      moves: string[]
      senteName: string | null
      goteName: string | null
    }
  | {
      ok: false
      format: KifuFormat
      /** 利用者にそのまま見せる理由 */
      message: string
    }

const FORMAT_LABELS: Record<KifuFormat, string> = {
  kif: 'KIF形式',
  usi: 'USI形式',
  ki2: 'KI2形式',
  csa: 'CSA形式',
  unknown: '不明な形式',
}

const FULL_WIDTH_DIGITS = '１２３４５６７８９'

const KIF_NAME_TO_TYPE: Array<[string, PieceType]> = [
  ['成香', '+KY'],
  ['成桂', '+KE'],
  ['成銀', '+GI'],
  ['と金', '+FU'],
  ['と', '+FU'],
  ['龍', '+HI'],
  ['竜', '+HI'],
  ['馬', '+KA'],
  ['玉', 'OU'],
  ['王', 'OU'],
  ['飛', 'HI'],
  ['角', 'KA'],
  ['金', 'KI'],
  ['銀', 'GI'],
  ['桂', 'KE'],
  ['香', 'KY'],
  ['歩', 'FU'],
]

const TERMINAL_WORDS = [
  '投了',
  '中断',
  '千日手',
  '持将棋',
  '詰み',
  '切れ負け',
  '反則勝ち',
  '反則負け',
  '入玉勝ち',
  '時間切れ',
  '封じ手',
]

/** SFEN の局面だけ（position も sfen も付かない）が貼られたか */
const BARE_SFEN = /^[1-9+A-Za-z]+(\/[1-9+A-Za-z]+){8}\s+[bw]\s+\S+(\s+\d+)?(\s+moves(\s|$)|$)/

/** 貼られた文字列がどの形式かを見分ける */
export function detectKifuFormat(rawText: string): KifuFormat {
  const text = String(rawText ?? '').trim()
  if (text === '') return 'unknown'

  if (/(^|\n)\s*[+-]\d{4}[A-Z]{2}/.test(text) || /(^|\n)V2\.\d/.test(text)) {
    return 'csa'
  }
  if (
    /手数----/.test(text) ||
    /(^|\n)\s*\d+\s*[^\s]*[(（]\d{2}[)）]/.test(text) ||
    /(^|\n)\s*(開始日時|手合割|先手|後手|棋戦|先手の持駒|後手の持駒)[：:]/.test(text) ||
    /(^|\n)\|.*\|[一二三四五六七八九]/.test(text)
  ) {
    return 'kif'
  }
  if (/[▲△▼☗☖]/.test(text)) return 'ki2'
  if (/(^|\s)(position\s+)?(startpos|sfen)(\s|$)/.test(text) || BARE_SFEN.test(text)) return 'usi'

  const tokens = text.split(/\s+/).filter(Boolean)
  if (tokens.length > 0 && tokens.every(isUsiMoveToken)) return 'usi'

  return 'unknown'
}

function toXY(fileChar: string, rankChar: string): { x: number; y: number } | null {
  let file = FULL_WIDTH_DIGITS.indexOf(fileChar) + 1
  if (file === 0) {
    const half = fileChar.charCodeAt(0) - 48
    if (half >= 1 && half <= 9) file = half
  }
  const rank = RANK_KANJI.indexOf(rankChar) + 1
  if (file < 1 || rank < 1) return null
  return { x: 9 - file, y: rank - 1 }
}

function baseTypeFromName(type: PieceType): BasePieceType | null {
  const bare = type.replace('+', '')
  return isBaseDropType(bare) ? (bare as BasePieceType) : null
}

/** 「金二　歩三」→ 枚数表。読めなければ null */
function parseBodHand(value: string): Record<BasePieceType, number> | null {
  const hand: Record<BasePieceType, number> = { HI: 0, KA: 0, KI: 0, GI: 0, KE: 0, KY: 0, FU: 0 }
  const text = value.trim()
  if (text === '' || text === 'なし') return hand
  for (const token of text.split(/[\s　、,]+/).filter(Boolean)) {
    const type = BOD_CHAR_TO_TYPE[token[0]]
    const base = type ? baseTypeFromName(type) : null
    if (!base || type !== base) return null
    const countText = token.slice(1)
    const count = countText === '' ? 1 : KANJI_NUMBERS.indexOf(countText)
    if (count < 1) return null
    hand[base] += count
  }
  return hand
}

/** 局面図（BOD）の盤の1段。「|v香v桂 ・…|一」 */
function parseBodRow(line: string): Array<{ type: PieceType; owner: Player } | null> | null {
  const match = line.match(/^\|(.*)\|/)
  if (!match) return null
  const cells = [...match[1].matchAll(/([ v^＾])([・玉王飛角金銀桂香歩龍竜馬全圭杏と])/g)]
  if (cells.length !== 9) return null
  return cells.map(([, side, ch]) => (ch === '・' ? null : { type: BOD_CHAR_TO_TYPE[ch], owner: side === ' ' ? SENTE : GOTE }))
}

type BodDraft = {
  rows: Array<Array<{ type: PieceType; owner: Player } | null>>
  hands: Record<Player, Record<BasePieceType, number> | null>
  sideToMove: Player
  /** 局面図までに指された手数（「手数＝N」）。無ければ 0 */
  movesPlayed: number
}

/** BOD の下書きを SFEN にして検証する。不正なら理由の文言 */
function bodToSfen(draft: BodDraft): { sfen: string } | { message: string } {
  if (draft.rows.length !== 9) return { message: '局面図の盤を読み取れませんでした。' }
  const sente = draft.hands[SENTE]
  const gote = draft.hands[GOTE]
  if (!sente || !gote) return { message: '局面図の持ち駒を読み取れませんでした。' }
  try {
    const sfen = toSfen({
      board: draft.rows,
      capturedPieces: { [SENTE]: sente, [GOTE]: gote },
      currentPlayer: draft.sideToMove,
      moveCount: draft.movesPlayed,
    })
    // 検証は parseSfen に任せる（二歩・行き所のない駒など、SFEN と同じ基準で断る）
    return { sfen: toSfen(parseSfen(sfen)) }
  } catch (error) {
    const reason = error instanceof SfenError ? error.message : '局面図が不正です'
    return { message: `局面図を読み取れませんでした（${reason}）。` }
  }
}

type BodyResult =
  | { ok: true; initialSfen: string | null; moves: string[]; senteName: string | null; goteName: string | null }
  | { ok: false; message: string }

function parseKifBody(text: string): BodyResult {
  const lines = text.split(/\r\n|\r|\n/)
  const moves: string[] = []
  let senteName: string | null = null
  let goteName: string | null = null
  let previous: { x: number; y: number } | null = null
  let handicap: string | null = null
  // 持ち駒の行が無い局面図は「なし」とみなす。書いてあって読めないときだけ null
  const bod: BodDraft = { rows: [], hands: { [SENTE]: parseBodHand(''), [GOTE]: parseBodHand('') }, sideToMove: SENTE, movesPlayed: 0 }
  let hasBod = false

  for (const rawLine of lines) {
    // 局面図の行は先頭の空白に意味がある（|、+、筋の見出し）ので trim 前に見る
    if (/^\s*\|/.test(rawLine)) {
      const row = parseBodRow(rawLine.trim())
      if (!row) return { ok: false, message: '局面図の盤を読み取れませんでした。' }
      bod.rows.push(row)
      hasBod = true
      continue
    }
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#') || line.startsWith('*')) continue
    if (line.startsWith('変化：')) break // 本譜だけ読む
    // 局面図の枠・筋の見出し（「９ ８ ７ …」。9手目の「9 ８八銀」と混同しないよう4筋ぶん見る）
    if (line.startsWith('+-') || /^[９9]\s*[８8]\s*[７7]\s*[６6]/.test(line)) continue
    if (line === '後手番' || line === '上手番') {
      bod.sideToMove = GOTE
      continue
    }
    if (line === '先手番' || line === '下手番') {
      bod.sideToMove = SENTE
      continue
    }
    const movesPlayed = line.match(/^手数[＝=]\s*(\d+)/)
    if (movesPlayed) {
      bod.movesPlayed = Number(movesPlayed[1])
      continue
    }

    const header = line.match(/^([^：:]+)[：:](.*)$/)
    if (header && !/^\s*\d/.test(line)) {
      const key = header[1].trim()
      const value = header[2].trim()
      if (key === '手合割') {
        handicap = value
      } else if (key === '先手' || key === '下手') {
        senteName = value || null
      } else if (key === '後手' || key === '上手') {
        goteName = value || null
      } else if (key === '先手の持駒' || key === '下手の持駒') {
        bod.hands[SENTE] = parseBodHand(value)
        hasBod = true
      } else if (key === '後手の持駒' || key === '上手の持駒') {
        bod.hands[GOTE] = parseBodHand(value)
        hasBod = true
      }
      continue
    }

    const moveLine = line.match(/^(\d+)\s+(.+)$/)
    if (!moveLine) continue
    const body = moveLine[2].replace(/[(（]\s*\d+:\d.*$/, '').trim()
    if (TERMINAL_WORDS.some((word) => body.startsWith(word))) break

    const parsed = body.match(
      /^(同\s*|[１-９1-9][一二三四五六七八九])\s*(成香|成桂|成銀|と金|と|龍|竜|馬|玉|王|飛|角|金|銀|桂|香|歩)([右左直上寄引]*)(不成|成)?(打)?\s*(?:[(（](\d)(\d)[)）])?/,
    )
    if (!parsed) {
      return { ok: false, message: `${moveLine[1]}手目「${body}」を読み取れませんでした。` }
    }

    let to: { x: number; y: number } | null
    if (parsed[1].startsWith('同')) {
      to = previous
      if (!to) return { ok: false, message: `${moveLine[1]}手目の「同」の指す場所が分かりませんでした。` }
    } else {
      to = toXY(parsed[1][0], parsed[1][1])
    }
    if (!to) return { ok: false, message: `${moveLine[1]}手目の移動先を読み取れませんでした。` }

    const nameEntry = KIF_NAME_TO_TYPE.find(([name]) => name === parsed[2])
    if (!nameEntry) return { ok: false, message: `${moveLine[1]}手目の駒「${parsed[2]}」を読み取れませんでした。` }
    const promote = parsed[4] === '成'
    const hasSource = parsed[6] !== undefined && parsed[7] !== undefined

    if (!hasSource) {
      const baseType = baseTypeFromName(nameEntry[1])
      if (!baseType) return { ok: false, message: `${moveLine[1]}手目の駒打ちを読み取れませんでした。` }
      moves.push(formatUsiMove({ type: 'drop', pieceType: baseType, toX: to.x, toY: to.y }))
    } else {
      const fromFile = Number(parsed[6])
      const fromRank = Number(parsed[7])
      if (fromFile < 1 || fromFile > 9 || fromRank < 1 || fromRank > 9) {
        return { ok: false, message: `${moveLine[1]}手目の移動元を読み取れませんでした。` }
      }
      moves.push(
        formatUsiMove({ type: 'move', fromX: 9 - fromFile, fromY: fromRank - 1, toX: to.x, toY: to.y, promote }),
      )
    }
    previous = to
  }

  let initialSfen: string | null = null
  if (hasBod) {
    // 局面図があれば、手合割の名前より局面図を優先する
    const converted = bodToSfen(bod)
    if ('message' in converted) return { ok: false, message: converted.message }
    initialSfen = normalizeInitialSfen(converted.sfen)
  } else if (handicap !== null && handicap !== '' && handicap !== '平手') {
    return { ok: false, message: `駒落ち（${handicap}）には未対応です。平手の棋譜か、局面図の付いた棋譜を読み込めます。` }
  }

  if (moves.length === 0 && initialSfen === null) {
    return { ok: false, message: '指し手が1手も見つかりませんでした。' }
  }
  return { ok: true, initialSfen, moves, senteName, goteName }
}

function parseUsiBody(text: string): BodyResult {
  let rest = text.trim().replace(/^position\s+/, '')
  let initialSfen: string | null = null

  const sfenPrefixed = rest.startsWith('sfen')
  if (sfenPrefixed || BARE_SFEN.test(rest)) {
    const sfenMatch = rest.match(/^(?:sfen\s+)?(\S+\s+\S+\s+\S+)(\s+\d+)?(?=\s|$)\s*/)
    if (!sfenMatch) return { ok: false, message: 'SFENの局面を読み取れませんでした。' }
    try {
      initialSfen = normalizeInitialSfen(sfenMatch[1] + (sfenMatch[2] ?? ''))
    } catch (error) {
      const reason = error instanceof SfenError ? `（${error.message}）` : ''
      return { ok: false, message: `SFENの局面を読み取れませんでした${reason}。` }
    }
    rest = rest.slice(sfenMatch[0].length)
  } else if (rest.startsWith('startpos')) {
    rest = rest.slice('startpos'.length)
  }
  rest = rest.trim().replace(/^moves\s*/, '')

  const tokens = rest.split(/\s+/).filter(Boolean)
  const moves: string[] = []
  for (const token of tokens) {
    if (!isUsiMoveToken(token)) return { ok: false, message: `「${token}」を指し手として読み取れませんでした。` }
    moves.push(token)
  }
  // 局面だけ（手が0手）でも、そこから指し始められるので受け付ける。平手で0手は読む物が無い
  if (moves.length === 0 && initialSfen === null) {
    return { ok: false, message: '指し手が1手も見つかりませんでした。' }
  }
  return { ok: true, initialSfen, moves, senteName: null, goteName: null }
}

/**
 * 貼られた文字列を読む。形式は自動で見分け、読めないときは必ず理由を返す。
 * 手順は最後に必ず開始局面から並べ直して、非合法手が混ざっていないか確かめる。
 */
export function parseKifuText(rawText: string): ParsedKifu {
  const text = String(rawText ?? '')
  if (text.trim() === '') {
    return { ok: false, format: 'unknown', message: '棋譜が空です。' }
  }

  const format = detectKifuFormat(text)
  if (format === 'ki2') {
    return {
      ok: false,
      format,
      message: 'KI2形式には未対応です。移動元が書かれておらず、推測すると別の棋譜になってしまうためです。',
    }
  }
  if (format === 'csa') {
    return { ok: false, format, message: 'CSA形式には未対応です。KIF形式かUSI形式で貼り付けてください。' }
  }
  if (format === 'unknown') {
    return {
      ok: false,
      format,
      message: '形式を判別できませんでした。KIF形式かUSI形式（position startpos moves …）で貼り付けてください。',
    }
  }

  const parsed = format === 'kif' ? parseKifBody(text) : parseUsiBody(text)
  if (!parsed.ok) return { ok: false, format, message: parsed.message }

  const replay = replayUsiMoves(parsed.initialSfen, parsed.moves)
  if (!replay.ok) {
    return {
      ok: false,
      format,
      message: `${(replay.failedAt ?? 0) + 1}手目が将棋のルールに合いません。棋譜が途中で壊れている可能性があります。`,
    }
  }
  return {
    ok: true,
    format,
    formatLabel: FORMAT_LABELS[format],
    initialSfen: parsed.initialSfen,
    moves: parsed.moves,
    senteName: parsed.senteName,
    goteName: parsed.goteName,
  }
}

/** 読み込み欄に出す「KIF形式・26手」の文言 */
export function describeParsed(parsed: ParsedKifu): string {
  if (!parsed.ok) return parsed.message
  const names =
    parsed.senteName || parsed.goteName
      ? `　先手「${parsed.senteName ?? '先手'}」／後手「${parsed.goteName ?? '後手'}」`
      : ''
  const start = parsed.initialSfen === null ? '平手' : '指定局面から'
  return `${parsed.formatLabel}として読み取れました ・ ${parsed.moves.length}手 ・ ${start}${names}`
}

export { KIFU_PIECE_NAMES }
