// SPDX-License-Identifier: GPL-3.0-only

// 棋譜まわりの入口。対局の基準は { initialSfen, usiMoves }（docs/PLAN.md §2.4）。

export { HIRATE_SFEN, SfenError, createGameState, isHirateSfen, normalizeInitialSfen, parseSfen, toSfen } from './sfen'
export { formatUsiMove, isUsiMoveToken, parseUsiMove, usiSquareToXY, xyToUsiSquare } from './moves'
export { initialPositionHash, replayUsiMoves } from './replay'
export type { ReplayResult, ReplayState } from './replay'
export { KIFU_PIECE_NAMES, buildNotation, compactNotation, notateMove } from './notation'
export type { NotationEntry } from './notation'
export { describeParsed, detectKifuFormat, formatKif, formatUsiPosition, parseKifuText } from './kif'
export type { KifExportOptions, KifuFormat, ParsedKifu } from './kif'
export { KIFU_URL_VERSION, KIFU_URL_VERSION_WITH_POSITION, clampMoveIndex, decodeKifuParam, encodeKifuParam } from './url'
export type { SharedKifu } from './url'
