// SPDX-License-Identifier: GPL-3.0-only

import { moveMarks } from '../diagram'
import type { Diagram, Pieces } from '../diagram'
import { figs, list, note, p, table } from '../types'
import type { Chapter } from '../types'

const CENTER = { files: [7, 3], ranks: [3, 7] } as const
const ZONE_CROP = { files: [6, 2], ranks: [1, 5] } as const

/** The three ranks of 先手's promotion zone, tinted. */
const zoneMarks = (files: number[]) =>
  files.flatMap((f) => [1, 2, 3].map((r) => ({ sq: `${f}${r}`, kind: 'target' as const })))

function promoted(glyph: string, name: string): Diagram {
  const pieces: Pieces = { '55': glyph }
  return { pieces, crop: CENTER, marks: moveMarks(pieces, '55'), caption: name, alt: `${name}の動き。点のあるマスへ動ける` }
}

export const promotion: Chapter = {
  slug: 'promotion',
  order: 3,
  title: '将棋の成り',
  navTitle: '成り',
  metaTitle: '将棋の成り｜敵陣で駒が強くなるルール',
  description:
    '将棋の駒は、敵陣に入る・出る・中で動くときに裏返して強くできます。飛車は竜、角は馬、銀・桂・香・歩は金の動きに。成らない選び方と、必ず成る場合も説明します。',
  lead: '将棋の成りは、駒が相手側の奥3段である敵陣に入ったときなどに、駒を裏返して強い駒に変えるルールです。玉と金は成りません。盤上で成った駒は元に戻せません。',
  summary: '敵陣で駒を裏返すと何が変わるか。成れる3つの場面、成らない選択、必ず成る場合。',
  updatedAt: '2026-09-28',
  hero: promoted('龍', '竜'),
  sections: [
    {
      id: 'zone',
      heading: '敵陣は相手側の奥3段',
      blocks: [
        p('自分から見て奥の3段、つまり先手なら一段目から三段目、後手なら七段目から九段目が「敵陣」です。相手の駒が最初に並んでいる3段と同じ場所です。'),
        figs({
          pieces: {},
          marks: zoneMarks([9, 8, 7, 6, 5, 4, 3, 2, 1]),
          caption: '色の付いた3段が、先手にとっての敵陣',
          alt: '将棋盤の一段目から三段目に色が付いている',
        }),
      ],
    },
    {
      id: 'when',
      heading: '成れる3つの場面',
      blocks: [
        p('駒は、次の3つのどれかに当てはまる手を指したときに成れます。動かす前か後のどちらかが敵陣にあれば成れる、と覚えるとかんたんです。'),
        list('敵陣に入るとき（外から敵陣へ）', '敵陣の中で動くとき', '敵陣から出るとき（敵陣から外へ）'),
        figs(
          {
            pieces: { '44': '銀' },
            crop: ZONE_CROP,
            marks: zoneMarks([6, 5, 4, 3, 2]),
            arrows: [{ from: '44', to: '33' }],
            caption: '入る：４四から３三へ',
            alt: '４四の銀が敵陣の３三へ進む',
          },
          {
            pieces: { '32': '銀' },
            crop: ZONE_CROP,
            marks: zoneMarks([6, 5, 4, 3, 2]),
            arrows: [{ from: '32', to: '21' }],
            caption: '中で動く：３二から２一へ',
            alt: '敵陣の中の３二の銀が２一へ進む',
          },
          {
            pieces: { '33': '銀' },
            crop: ZONE_CROP,
            marks: zoneMarks([6, 5, 4, 3, 2]),
            arrows: [{ from: '33', to: '44' }],
            caption: '出る：３三から４四へ',
            alt: '敵陣の３三の銀が斜め後ろの４四へ下がる',
          },
        ),
        p('成れるのは飛車・角・銀・桂馬・香車・歩の6種類です。玉と金は成りません。成った駒は裏返し、表と違う文字の面を上にします。'),
      ],
    },
    {
      id: 'after',
      heading: '成った駒の動き',
      blocks: [
        table(
          ['元の駒', '成ると', '動き'],
          [
            ['飛車', '竜（龍王）', '飛車の動き＋斜めに1マス'],
            ['角', '馬（龍馬）', '角の動き＋縦横に1マス'],
            ['銀', '成銀', '金と同じ'],
            ['桂馬', '成桂', '金と同じ'],
            ['香車', '成香', '金と同じ'],
            ['歩', 'と金', '金と同じ'],
          ],
        ),
        figs(promoted('龍', '竜：飛車の動き＋斜め1マス'), promoted('馬', '馬：角の動き＋縦横1マス'), promoted('と', 'と金：金と同じ動き')),
        p('竜と馬は大駒の動きをそのまま残して、苦手だった方向に1マスずつ動けるようになります。銀・桂馬・香車・歩は成るとみな金と同じ動きになり、とくに歩が成った「と金」は、取られても相手には歩1枚しか渡らない、とても得な駒です。'),
      ],
    },
    {
      id: 'choose',
      heading: '成らない選択（不成）',
      blocks: [
        p('成れる場面でも、成らずにそのままの駒でいることを選べます。これを「不成（ならず）」といいます。'),
        p('飛車・角・歩は、成って困ることがほとんどないので、成れるときはふつう成ります。いっぽう銀は、成ると金の動きになって斜め後ろへ下がれなくなるため、あえて成らないことがよくあります。桂馬や香車も、場面によっては成らないほうが相手の玉に近づきやすいことがあります。'),
        note('このサイトでは', '成れる手を指すと、行き先の横に「成る」「成らない」の選択が出ます。成らないとこの先動けなくなる場合（次の項目）は、選択を出さずに自動で成ります。'),
      ],
    },
    {
      id: 'must',
      heading: '必ず成らなければいけない場合',
      blocks: [
        p('成らないと次から一歩も動けなくなる場所では、必ず成ります。歩と香車は一段目（相手側のいちばん奥）、桂馬は一段目と二段目です。成らないまま置くと「行き所のない駒」という反則になります（[反則](/guide/fouls)）。'),
        figs({
          pieces: { '34': '桂' },
          crop: ZONE_CROP,
          marks: zoneMarks([6, 5, 4, 3, 2]),
          arrows: [{ from: '34', to: '22' }],
          caption: '桂馬が二段目へ跳ぶ手は、必ず成桂になる',
          alt: '３四の桂馬が二段目の２二へ跳ぶ。この先動けなくなるので必ず成る',
        }),
        p('一度成った駒は、盤の上では元に戻せません。ただし相手に取られると、元の駒に戻ってから相手の持ち駒になります。'),
      ],
    },
  ],
  takeaway: [
    '敵陣は相手側の奥3段。入る・中で動く・出るときに成れる',
    '成れるのは飛車・角・銀・桂馬・香車・歩。玉と金は成らない',
    '飛車は竜、角は馬に。銀・桂馬・香車・歩は成ると金の動きになる',
    '銀などは成らない選択もある。動けなくなる場所では必ず成る',
  ],
}
