// SPDX-License-Identifier: GPL-3.0-only

// On-screen copy for the waza effect: the name and its reading (standard shogi
// terms) plus our own one-line explanation. Detection ids come from
// core/waza/types.ts.

import type { AnyWazaId } from '../core/waza/types'

export interface WazaCopy {
  name: string
  kana: string
  /** One line shown on the card: what the move achieves. */
  line: string
}

export const WAZA_COPY: Record<AnyWazaId, WazaCopy> = {
  // 手筋
  tarefu: { name: '垂れ歩', kana: 'たれふ', line: '一歩先で成れる位置に、歩を待たせました' },
  tataki_no_fu: { name: 'たたきの歩', kana: 'たたきのふ', line: '歩を捨てて、相手の駒を呼び寄せます' },
  tokin_zukuri: { name: 'と金作り', kana: 'ときんづくり', line: 'と金は金と同じ強さ。取られても損は歩一枚' },
  wariuchi_no_gin: { name: '割り打ちの銀', kana: 'わりうちのぎん', line: '銀が後ろ斜めに2枚をにらむ両取りです' },
  fundoshi_no_kei: { name: 'ふんどしの桂', kana: 'ふんどしのけい', line: '桂馬の跳ねる2か所で、両取りになりました' },
  oute_bisha: { name: '王手飛車', kana: 'おうてびしゃ', line: '玉を守らせている間に、飛車がいただけます' },
  juji_bisha: { name: '十字飛車', kana: 'じゅうじびしゃ', line: '縦と横、飛車の利きで2枚同時に狙います' },
  dengaku_zashi: { name: '田楽刺し', kana: 'でんがくざし', line: '一直線に並んだ2枚を、まとめて串刺しに' },
  atama_kin: { name: '頭金', kana: 'あたまきん', line: '玉の頭に金。いちばん基本の詰み形です' },

  // 囲い
  kata_mino: { name: '片美濃囲い', kana: 'かたみのがこい', line: '少ない手数で組める、振り飛車の定番です' },
  hon_mino: { name: '本美濃囲い', kana: 'ほんみのがこい', line: '金が2枚そろって、横からの攻めに強い形' },
  taka_mino: { name: '高美濃囲い', kana: 'たかみのがこい', line: '金を上げて、上からの攻めにも備えました' },
  gin_kanmuri: { name: '銀冠', kana: 'ぎんかんむり', line: '玉の真上に銀。上部に厚い堅陣です' },
  fune_gakoi: { name: '舟囲い', kana: 'ふながこい', line: '居飛車ですぐ組める、軽い囲いです' },
  yagura: { name: '矢倉囲い', kana: 'やぐらがこい', line: '金銀3枚で玉を包む、居飛車の本格派' },
  kani_gakoi: { name: 'カニ囲い', kana: 'かにがこい', line: '金2枚が左右に開いた、急戦向きの形' },
  kin_muso: { name: '金無双', kana: 'きんむそう', line: '金を横に並べて、相振り飛車に強い形' },
  ibisha_anaguma: { name: '居飛車穴熊', kana: 'いびしゃあなぐま', line: '玉を隅にもぐらせた、いちばん固い囲い' },
  furibisha_anaguma: { name: '振り飛車穴熊', kana: 'ふりびしゃあなぐま', line: '振り飛車のまま、玉を隅へ深く囲いました' },

  // 戦法
  bogin: { name: '棒銀', kana: 'ぼうぎん', line: '飛車の前に銀を出して、端から突破を狙います' },
  naka_bisha: { name: '中飛車', kana: 'なかびしゃ', line: '飛車を5筋へ。中央から押し込む作戦です' },
  shiken_bisha: { name: '四間飛車', kana: 'しけんびしゃ', line: '飛車を6筋（後手は4筋）へ振りました' },
  sanken_bisha: { name: '三間飛車', kana: 'さんけんびしゃ', line: '飛車を7筋（後手は3筋）へ振りました' },
  mukai_bisha: { name: '向かい飛車', kana: 'むかいびしゃ', line: '相手の飛車と向かい合う筋へ振りました' },
}

/** Replaces the card line the first time ever a player makes this waza. */
export const WAZA_FIRST_LINE = 'この技、はじめて決まりました！'
