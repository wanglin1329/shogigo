// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2025~ Yuki Lab
// Copyright 2026 the shogi project contributors
// Modified 2026-09-27: import paths; the client/server parity check is gone (the
// client uses this same TS module), and the rooms-API integration moved to
// test/worker/name-filter-api.spec.ts.

// 表示名NG語フィルタのテスト。
// 2) 判定: リバーシ由来のケーステーブル（test/fixtures/name_filter_cases.json）どおりに検知・許容すること
//    ※日本語文字のNGケースだけは対象外。JP_WORDS辞書は移植していない（表示名が
//      半角英数字と _ - . に制限されるため日本語はフィルタに到達しない。設計書 §5.2）
// 3) 統合: normalizeDisplayName 経由（部屋作成API）で実際に伏せ字になること

import { describe, expect, it } from "vitest";
import cases from "./fixtures/name_filter_cases.json";
import { isProfane, maskBadWords } from "../../src/online/name-filter";
// このアプリのフィルタに到達しない入力の判別。表示名は normalizeDisplayName が
// NFKC → 半角英数字と _ - . 以外を除去、の順で整えてから伏せ字化するので、
// 日本語（JP_WORDS 未移植）も記号 leet（"$hit" "f@ck"）もフィルタまで届かない。
// 判定は NFKC 後に行う（"ｓｈｉｎｅ" は "shine" になって届くので対象外にしない）。
const STRIPPED_BEFORE_FILTER = (input: string): boolean =>
  /[^A-Za-z0-9_\-.]/.test(input.normalize("NFKC"));

describe("name filter behavior (riversi case table)", () => {
  it("detects every NG case (except inputs stripped before the filter)", () => {
    for (const input of cases.ng) {
      if (STRIPPED_BEFORE_FILTER(input)) continue;
      expect(isProfane(input), `should be NG: ${JSON.stringify(input)}`).toBe(true);
    }
  });

  it("passes every OK case unchanged", () => {
    for (const input of cases.ok) {
      expect(maskBadWords(input), `should be OK: ${JSON.stringify(input)}`).toBe(input);
    }
  });

  it("matches the exact masked outputs (except inputs stripped before the filter)", () => {
    for (const [input, expected] of cases.output) {
      if (STRIPPED_BEFORE_FILTER(input)) continue;
      expect(maskBadWords(input)).toBe(expected);
    }
  });
});
