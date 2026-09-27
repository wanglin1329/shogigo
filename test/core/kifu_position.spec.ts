// SPDX-License-Identifier: GPL-3.0-only

// 途中局面から始まる対局（initialSfen、docs/PLAN.md §2.4）が
// SFEN・並べ直し・千日手・共有URL・USI/KIF の読み書きを通しで壊れないこと。

import { describe, expect, it } from 'vitest'
import { createInitialGameState, getBoardHash, GOTE, SENTE } from '../../src/games/shogi/core/engine'
import {
  HIRATE_SFEN,
  SfenError,
  buildNotation,
  createGameState,
  decodeKifuParam,
  encodeKifuParam,
  formatKif,
  formatUsiPosition,
  initialPositionHash,
  isHirateSfen,
  normalizeInitialSfen,
  parseKifuText,
  parseSfen,
  replayUsiMoves,
  toSfen,
} from '../../src/games/shogi/core/kifu'

// 1手詰め風：後手玉 2一、先手の金 2三、先手の持ち駒に金。残りの駒はすべて後手の持ち駒
const TSUME = '7k1/9/7G1/9/9/9/9/9/9 b G2r2b2g4s4n4l18p 1'
// 玉だけ。千日手を作るのに使う
const KINGS_ONLY = '4k4/9/9/9/9/9/9/9/4K4 b - 1'
// 後手番から始まる、成駒と持ち駒のある局面
const GOTE_TO_MOVE = 'ln1g1g1nl/1r1sk2+B1/p1ppppp1p/9/1p5p1/9/PPPPPPP1P/1S5R1/LN1GKGSNL w Bs 20'

describe('SFEN の読み書き', () => {
  it('平手の SFEN は初形と同じ局面になり、書き戻すと元に戻る', () => {
    const state = parseSfen(HIRATE_SFEN)
    const initial = createInitialGameState()
    expect(state.board).toEqual(initial.board)
    expect(state.capturedPieces).toEqual(initial.capturedPieces)
    expect(state.currentPlayer).toBe(SENTE)
    expect(state.moveCount).toBe(0)
    expect(state.positionHistory).toEqual(initial.positionHistory)
    expect(toSfen(state)).toBe(HIRATE_SFEN)
  })

  it.each([TSUME, KINGS_ONLY, GOTE_TO_MOVE])('往復できる: %s', (sfen) => {
    expect(toSfen(parseSfen(sfen))).toBe(sfen)
  })

  it('持ち駒の並びは正規化される（先手 飛角金銀桂香歩 → 後手）', () => {
    const scrambled = '7k1/9/7G1/9/9/9/9/9/9 b 18p4l4n4s2g2b2rG 1'
    expect(toSfen(parseSfen(scrambled))).toBe(TSUME)
  })

  it('手数の欄は省略でき、手数は moveCount（次の手の番号 - 1）に入る', () => {
    expect(parseSfen('4k4/9/9/9/9/9/9/9/4K4 b -').moveCount).toBe(0)
    const gote = parseSfen(GOTE_TO_MOVE)
    expect(gote.moveCount).toBe(19)
    expect(gote.currentPlayer).toBe(GOTE)
    expect(gote.board[1][7]).toEqual({ type: '+KA', owner: SENTE })
    expect(gote.capturedPieces[SENTE].KA).toBe(1)
    expect(gote.capturedPieces[GOTE].GI).toBe(1)
  })

  it('攻め方の玉が無い詰将棋の局面を読める', () => {
    const state = parseSfen(TSUME)
    expect(state.capturedPieces[GOTE].FU).toBe(18)
    expect(state.isCheck).toBe(false)
  })

  it('開始局面の千日手用の履歴は1局面ぶんで始まる', () => {
    const state = parseSfen(TSUME)
    expect(state.positionHistory).toEqual([getBoardHash(state.board, state.capturedPieces, state.currentPlayer)])
    expect(state.checkHistory).toEqual([false])
    expect(state.turnHistory).toEqual([SENTE])
    expect(state.usiMoveHistory).toEqual([])
  })

  it.each([
    ['段数が足りない', '4k4/9/9/9/9/9/9/4K4 b - 1'],
    ['マス数が合わない', '4k5/9/9/9/9/9/9/9/4K4 b - 1'],
    ['知らない駒の文字', '4x4/9/9/9/9/9/9/9/4K4 b - 1'],
    ['成れない駒に +', '4+k4/9/9/9/9/9/9/9/4K4 b - 1'],
    ['手番の文字が違う', KINGS_ONLY.replace(' b ', ' x ')],
    ['手数が0', '4k4/9/9/9/9/9/9/9/4K4 b - 0'],
    ['持ち駒が読めない', '4k4/9/9/9/9/9/9/9/4K4 b 2 1'],
    ['持ち駒に玉', '4k4/9/9/9/9/9/9/9/4K4 b K 1'],
    ['先手の玉が2枚', '4k4/9/9/9/9/9/9/9/3KK4 b - 1'],
    ['歩が19枚', '4k4/9/9/9/9/9/9/9/4K4 b 19P 1'],
    ['二歩', '4k4/9/9/9/9/4P4/4P4/9/4K4 b - 1'],
    ['行き所のない歩', 'P3k4/9/9/9/9/9/9/9/4K4 b - 1'],
    ['行き所のない桂', '4k4/N8/9/9/9/9/9/9/4K4 b - 1'],
    ['手番でない側が王手されている', '4k4/4R4/9/9/9/9/9/9/4K4 b - 1'],
    ['欄が多すぎる', `${KINGS_ONLY} extra`],
  ])('不正な SFEN は SfenError（%s）', (_label, sfen) => {
    expect(() => parseSfen(sfen)).toThrow(SfenError)
  })

  it('手番の側が王手されているのは正しい局面', () => {
    expect(parseSfen('4k4/4R4/9/9/9/9/9/9/4K4 w - 1').isCheck).toBe(true)
  })
})

describe('開始局面の正規化', () => {
  it('平手（手数1）は null、それ以外は書式を揃えた SFEN', () => {
    expect(normalizeInitialSfen(null)).toBeNull()
    expect(normalizeInitialSfen(HIRATE_SFEN)).toBeNull()
    expect(normalizeInitialSfen(`  ${HIRATE_SFEN.replace(' 1', '')}  `)).toBeNull()
    expect(normalizeInitialSfen('7k1/9/7G1/9/9/9/9/9/9 b 18p4l4n4s2g2b2rG')).toBe(TSUME)
  })

  it('平手でも手数が1でなければ平手扱いしない（手数の表示が変わるため）', () => {
    expect(normalizeInitialSfen(HIRATE_SFEN.replace(/ 1$/, ' 5'))).not.toBeNull()
    expect(isHirateSfen(HIRATE_SFEN.replace(/ 1$/, ' 5'))).toBe(false)
  })

  it('isHirateSfen は壊れた SFEN で例外を出さない', () => {
    expect(isHirateSfen(HIRATE_SFEN)).toBe(true)
    expect(isHirateSfen('broken')).toBe(false)
  })

  it('createGameState(null) は平手の初形', () => {
    expect(createGameState(null)).toEqual(createInitialGameState())
  })
})

describe('途中局面からの並べ直し', () => {
  it('開始局面の手番・手数から並べ始める', () => {
    const result = replayUsiMoves(GOTE_TO_MOVE, ['8b8d', '2b3a'])
    expect(result.ok).toBe(true)
    expect(result.initialSfen).toBe(GOTE_TO_MOVE)
    expect(result.states[0].currentPlayer).toBe(GOTE)
    expect(result.states[0].moveCount).toBe(19)
    expect(result.states[2].moveCount).toBe(21)
    expect(result.states[2].board[0][6]).toEqual({ type: '+KA', owner: SENTE })
  })

  it('平手の SFEN を渡すと null を渡したのと同じ結果', () => {
    const a = replayUsiMoves(HIRATE_SFEN, ['7g7f', '3c3d'])
    const b = replayUsiMoves(null, ['7g7f', '3c3d'])
    expect(a.initialSfen).toBeNull()
    expect(a.positionHistory).toEqual(b.positionHistory)
  })

  it('1手詰めを詰ませると終局する', () => {
    const result = replayUsiMoves(TSUME, ['G*2b'])
    expect(result.ok).toBe(true)
    expect(result.gameOver).toBe(true)
    expect(result.resultReason).toBe('checkmate')
    expect(result.winner).toBe(SENTE)
  })

  it('途中局面から始めても千日手を数えられる', () => {
    const cycle = ['5i5h', '5a5b', '5h5i', '5b5a']
    const result = replayUsiMoves(KINGS_ONLY, [...cycle, ...cycle, ...cycle])
    expect(result.ok).toBe(true)
    expect(result.gameOver).toBe(true)
    expect(result.resultReason).toBe('sennichite')
    expect(result.states[result.states.length - 2].gameOver).toBe(false)
  })

  it('🔴 開始局面が違えば前回の結果を使い回さない', () => {
    const previous = replayUsiMoves(KINGS_ONLY, ['5i5h'])
    const other = '4k4/9/9/9/9/9/9/9/3K5 b - 1'
    const result = replayUsiMoves(other, ['6i6h'], previous)
    expect(result.ok).toBe(true)
    expect(result.states[0].board[8][3]).toEqual({ type: 'OU', owner: SENTE }) // ６九
    expect(result.usiMoves).toEqual(['6i6h'])
  })

  it('同じ開始局面なら続きから並べても同じ結果', () => {
    const cycle = ['5i5h', '5a5b', '5h5i', '5b5a']
    const all = [...cycle, ...cycle, ...cycle]
    const previous = replayUsiMoves(KINGS_ONLY, all.slice(0, 5))
    const continued = replayUsiMoves(KINGS_ONLY, all, previous)
    expect(continued.positionHistory).toEqual(replayUsiMoves(KINGS_ONLY, all).positionHistory)
    expect(continued.resultReason).toBe('sennichite')
  })

  it('開始局面のハッシュは並べ直しの先頭と同じ', () => {
    expect(initialPositionHash(TSUME)).toBe(replayUsiMoves(TSUME, []).positionHistory[0])
    expect(initialPositionHash()).toBe(replayUsiMoves(null, []).positionHistory[0])
  })

  it('壊れた開始局面は SfenError（外から来た文字列は先に検証する約束）', () => {
    expect(() => replayUsiMoves('broken', [])).toThrow(SfenError)
  })
})

describe('途中局面からの棋譜の表記', () => {
  it('後手番から始まれば1手目は △、手数は1から数える', () => {
    const entries = buildNotation(GOTE_TO_MOVE, ['8b8d', '2b3a'])
    expect(entries[0]).toMatchObject({ ply: 1, player: GOTE })
    expect(entries[0].text.startsWith('△')).toBe(true)
    expect(entries[1].text).toBe('▲３一馬')
  })
})

describe('共有URL v2（途中局面）', () => {
  it('途中局面と手順が往復する', () => {
    const encoded = encodeKifuParam({ initialSfen: GOTE_TO_MOVE, usiMoves: ['8b8d', '2b3a'] })
    expect(encoded).not.toBeNull()
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeKifuParam(encoded)).toEqual({ initialSfen: GOTE_TO_MOVE, usiMoves: ['8b8d', '2b3a'] })
  })

  it('局面だけ（0手）でも往復する', () => {
    const encoded = encodeKifuParam({ initialSfen: TSUME, usiMoves: [] })
    expect(decodeKifuParam(encoded)).toEqual({ initialSfen: TSUME, usiMoves: [] })
  })

  it('書式を揃えて載せる（持ち駒の並びが違っても同じ URL）', () => {
    const a = encodeKifuParam({ initialSfen: TSUME, usiMoves: [] })
    const b = encodeKifuParam({ initialSfen: '7k1/9/7G1/9/9/9/9/9/9 b 18p4l4n4s2g2b2rG', usiMoves: [] })
    expect(a).toBe(b)
  })

  it('平手は SFEN を書いても v1 の短い URL になる（古いリンクと同じ）', () => {
    const moves = ['7g7f', '3c3d']
    expect(encodeKifuParam({ initialSfen: HIRATE_SFEN, usiMoves: moves })).toBe(
      encodeKifuParam({ initialSfen: null, usiMoves: moves }),
    )
    expect(encodeKifuParam({ initialSfen: null, usiMoves: moves })!.startsWith('A')).toBe(true) // 先頭バイト 1
  })

  it('壊れた開始局面は書けない・読めない', () => {
    expect(encodeKifuParam({ initialSfen: 'broken', usiMoves: [] })).toBeNull()
    // v2 の SFEN 部分を二歩に書き換えたもの
    const encoded = encodeKifuParam({ initialSfen: KINGS_ONLY, usiMoves: [] })!
    const bytes = [...atob(encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (encoded.length % 4)) % 4))].map(
      (c) => c.charCodeAt(0),
    )
    const sfen = String.fromCharCode(...bytes.slice(2, 2 + bytes[1]))
    const broken = sfen.replace('9/9/9/4K4', '4P4/4P4/9/4K4')
    const forged = [2, broken.length, ...[...broken].map((c) => c.charCodeAt(0))]
    const forgedParam = btoa(String.fromCharCode(...forged)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(decodeKifuParam(forgedParam)).toBeNull()
  })

  it('SFEN の長さが実際より長いと宣言されていれば読めない', () => {
    const param = btoa(String.fromCharCode(2, 200, 65, 66)).replace(/=+$/, '')
    expect(decodeKifuParam(param)).toBeNull()
  })
})

describe('USI の読み書き（途中局面）', () => {
  it('position の形で書き出し、そのまま読み戻せる', () => {
    const moves = ['8b8d', '2b3a']
    const text = formatUsiPosition(GOTE_TO_MOVE, moves)
    expect(text).toBe(`position sfen ${GOTE_TO_MOVE} moves 8b8d 2b3a`)
    const parsed = parseKifuText(text)
    expect(parsed).toMatchObject({ ok: true, format: 'usi', initialSfen: GOTE_TO_MOVE, moves })
  })

  it('平手は startpos で書く', () => {
    expect(formatUsiPosition(null, ['7g7f'])).toBe('position startpos moves 7g7f')
    expect(formatUsiPosition(HIRATE_SFEN, [])).toBe('position startpos')
  })

  it('局面だけ（0手）の SFEN も読める。平手で0手は読む物が無いので断る', () => {
    expect(parseKifuText(`position sfen ${TSUME}`)).toMatchObject({ ok: true, initialSfen: TSUME, moves: [] })
    expect(parseKifuText('position startpos')).toMatchObject({ ok: false })
  })

  it('position も sfen も付かない SFEN だけでも読める', () => {
    expect(parseKifuText(TSUME)).toMatchObject({ ok: true, format: 'usi', initialSfen: TSUME, moves: [] })
    expect(parseKifuText(`${KINGS_ONLY} moves 5i5h`)).toMatchObject({ ok: true, moves: ['5i5h'] })
  })

  it('途中局面から合わない手は何手目かを言う', () => {
    const parsed = parseKifuText(`position sfen ${KINGS_ONLY} moves 5i5h 5a5b 5h5f`)
    expect(parsed).toMatchObject({ ok: false })
    if (!parsed.ok) expect(parsed.message).toContain('3手目')
  })
})

describe('KIF の局面図（BOD）', () => {
  it('途中局面の棋譜は局面図付きで書き出され、読み戻すと同じ局面と手順になる', () => {
    const moves = ['8b8d', '2b3a']
    const kif = formatKif(GOTE_TO_MOVE, moves, { senteName: 'あなた', goteName: 'AI' })
    expect(kif).not.toContain('手合割')
    expect(kif).toContain('後手の持駒：銀')
    expect(kif).toContain('先手の持駒：角')
    expect(kif).toContain('後手番')
    expect(kif).toContain('手数＝19') // SFEN の手数 20 = 19手指された後
    expect(kif).toContain('|v香') // 1段目の左端は後手の香
    const parsed = parseKifuText(kif)
    expect(parsed).toMatchObject({ ok: true, format: 'kif', initialSfen: GOTE_TO_MOVE, moves, senteName: 'あなた' })
  })

  it('持ち駒の枚数（十八まで）を往復できる', () => {
    const kif = formatKif(TSUME, ['G*2b'])
    expect(kif).toContain('後手の持駒：飛二　角二　金二　銀四　桂四　香四　歩十八')
    expect(parseKifuText(kif)).toMatchObject({ ok: true, initialSfen: TSUME, moves: ['G*2b'] })
  })

  it('平手は従来どおり「手合割：平手」で書く', () => {
    expect(formatKif(null, ['7g7f'])).toContain('手合割：平手')
    expect(formatKif(HIRATE_SFEN, ['7g7f'])).toContain('手合割：平手')
  })

  it('局面図があれば手合割の名前より局面図を優先する', () => {
    const kif = formatKif(KINGS_ONLY, ['5i5h']).replace('先手：', '手合割：その他\r\n先手：')
    expect(parseKifuText(kif)).toMatchObject({ ok: true, initialSfen: KINGS_ONLY })
  })

  it('局面図が不正（二歩）なら理由を出して断る', () => {
    const kif = formatKif(KINGS_ONLY, ['5i5h']).replace('| ・ ・ ・ ・ ・ ・ ・ ・ ・|七', '| ・ ・ ・ ・ 歩 ・ ・ ・ ・|七')
      .replace('| ・ ・ ・ ・ ・ ・ ・ ・ ・|六', '| ・ ・ ・ ・ 歩 ・ ・ ・ ・|六')
    const parsed = parseKifuText(kif)
    expect(parsed).toMatchObject({ ok: false })
    if (!parsed.ok) expect(parsed.message).toContain('局面図')
  })
})
