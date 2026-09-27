// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef, useState } from 'react'

import { DEFAULT_AI_LEVEL, isAiLevelId } from '../../ai/levels'
import type { Player } from '../../core/engine'
import * as api from '../../online/api'
import type { RoomEntry, TimeControl } from '../../online/api'
import { useBotGame } from '../../online/botGame'
import type { BotGameOptions } from '../../online/botGame'
import { formatClock } from '../../online/clock'
import { getOnlineUid, loadNameProfile, saveNameProfile, shownName, wireName } from '../../online/identity'
import type { NameProfile } from '../../online/identity'
import { FOUND_PAUSE_MS, secondsUntilBot, useMatchmaking } from '../../online/matchmaking'
import { START_TIMEOUT_MS, useRoomConnection } from '../../online/room'
import { isRandomMatchUnlocked, markOnlinePlayed } from '../../online/unlock'
import type { OnlineStats, SidePref } from '../../server/protocol'
import { readJson } from '../../../../site/storage'
import { lineShareUrl, openExternal } from '../../../../site/share'
import { unlockAudio } from '../feedback'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../settings'
import type { ShogiSettings } from '../settings'
import { NameDialog } from './NameDialog'
import { OnlineGame } from './OnlineGame'
import type { OnlineGameModel } from './OnlineGame'
import { RankBadge } from './RankBadge'
import { TutorialGame } from './TutorialGame'

type Screen =
  | { kind: 'lobby' }
  | { kind: 'room'; code: string; token: string; initial?: RoomEntry; matchType: 'invite' | 'matchmaking' }
  | { kind: 'bot'; options: BotGameOptions }
  | { kind: 'tutorial' }

const TIME_CONTROLS: { value: string; label: string; tc: TimeControl }[] = [
  { value: 'none', label: '時間制限なし', tc: { type: 'none', seconds: 0 } },
  { value: 'per_move:30', label: '1手30秒', tc: { type: 'per_move', seconds: 30 } },
  { value: 'per_move:60', label: '1手60秒', tc: { type: 'per_move', seconds: 60 } },
  { value: 'per_move:10', label: '1手10秒', tc: { type: 'per_move', seconds: 10 } },
  { value: 'total:300', label: '持ち時間5分（切れ負け）', tc: { type: 'total', seconds: 300 } },
  { value: 'total:600', label: '持ち時間10分（切れ負け）', tc: { type: 'total', seconds: 600 } },
  { value: 'total:180', label: '持ち時間3分（切れ負け）', tc: { type: 'total', seconds: 180 } },
]

const STATS_POLL_MS = 30_000

function setRoomParam(code: string | null) {
  const url = code ? `${location.pathname}?room=${encodeURIComponent(code)}` : location.pathname
  history.replaceState(history.state, '', url)
}

function inviteUrl(code: string) {
  return `${location.origin}/online?room=${encodeURIComponent(code)}`
}

function aiLevelOrDefault(stored: unknown) {
  return isAiLevelId(stored) ? stored : DEFAULT_AI_LEVEL
}

export function OnlinePage({ roomParam }: { roomParam: string | null }) {
  const [ready, setReady] = useState(false)
  const [uid, setUid] = useState('')
  const [profile, setProfile] = useState<NameProfile>({ mode: 'default', name: '' })
  const [settings, setSettings] = useState<ShogiSettings>(DEFAULT_SETTINGS)
  const [stats, setStats] = useState<OnlineStats>({ playing: 0 })
  const [screen, setScreen] = useState<Screen>({ kind: 'lobby' })
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [nameOpen, setNameOpen] = useState(false)
  const [sidePref, setSidePref] = useState<SidePref>('random')
  const [tcValue, setTcValue] = useState('none')
  const mm = useMatchmaking()

  // Everything that reads storage happens after hydration.
  useEffect(() => {
    const id = getOnlineUid()
    setUid(id)
    setProfile(loadNameProfile())
    setSettings(loadSettings())
    // The uid-less call carries the server's COM wait (edge-cached); the personal one the rating.
    void Promise.all([api.getOnlineStats(id), api.getOnlineStats()]).then(([mine, open]) =>
      setStats({ ...mine, botFallbackSeconds: open.botFallbackSeconds }),
    )
    setReady(true)
  }, [])

  function changeSettings(next: ShogiSettings) {
    setSettings(next)
    saveSettings(next)
  }

  // Player count in the lobby (cached at the edge, no uid → no personal data).
  useEffect(() => {
    if (screen.kind !== 'lobby') return
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void api.getOnlineStats().then((s) => setStats((old) => ({ ...old, playing: s.playing, botFallbackSeconds: s.botFallbackSeconds ?? old.botFallbackSeconds })))
      }
    }, STATS_POLL_MS)
    return () => clearInterval(t)
  }, [screen.kind])

  // Invite link: join the room once identity is known.
  const joined = useRef<string | null>(null)
  useEffect(() => {
    if (!ready || !roomParam || joined.current === roomParam) return
    joined.current = roomParam
    setBusy(true)
    void api.joinRoom(roomParam, { uid, displayName: wireName(profile) }).then((res) => {
      setBusy(false)
      if (!res.ok) {
        setRoomParam(null)
        setMessage(api.errorMessage(res.error.code, 'join'))
        return
      }
      setScreen({ kind: 'room', code: res.match.room_code, token: res.token, initial: res, matchType: res.match.match_type })
    })
  }, [ready, roomParam, uid, profile])

  // Matchmaking results.
  useEffect(() => {
    const s = mm.state
    if (s.phase === 'found') {
      const t = setTimeout(() => {
        setScreen({ kind: 'room', code: s.roomCode, token: s.token, matchType: 'matchmaking' })
        mm.reset()
      }, FOUND_PAUSE_MS)
      return () => clearTimeout(t)
    }
    if (s.phase === 'bot') {
      setScreen({
        kind: 'bot',
        options: {
          ticket: s.ticket,
          // The AI page's last level; comLevelFor() turns every やねうら王 level
          // (伝説 included, so no unlock check here) into 超級.
          level: aiLevelOrDefault(readJson('shogi.ai.level')),
          playerName: wireName(profile),
          playerRank: stats.rating?.rank ?? null,
          hideRank: settings.hideRank,
        },
      })
      mm.reset()
    }
    if (s.phase === 'error') setMessage(s.message)
  }, [mm.state])

  function seek() {
    unlockAudio()
    setMessage(null)
    mm.seek({ uid, name: wireName(profile), botFallback: settings.botFallback, hideRank: settings.hideRank })
  }

  async function createInvite(side: SidePref, tc: TimeControl) {
    unlockAudio()
    setBusy(true)
    setMessage(null)
    const res = await api.createRoom({ uid, displayName: wireName(profile), side, tc })
    setBusy(false)
    if (!res.ok) {
      setMessage(api.errorMessage(res.error.code, 'create'))
      return
    }
    setRoomParam(res.match.room_code)
    joined.current = res.match.room_code
    setScreen({ kind: 'room', code: res.match.room_code, token: res.token, initial: res, matchType: 'invite' })
  }

  function toLobby(note: string | null = null) {
    setRoomParam(null)
    setScreen({ kind: 'lobby' })
    setMessage(note)
    void api.getOnlineStats(uid).then((mine) => setStats((old) => ({ ...mine, botFallbackSeconds: old.botFallbackSeconds })))
  }

  const tc = TIME_CONTROLS.find((t) => t.value === tcValue)?.tc ?? TIME_CONTROLS[0].tc

  if (screen.kind === 'room') {
    return (
      <RoomSession
        key={screen.code}
        screen={screen}
        settings={settings}
        onLobby={toLobby}
        onAgain={(side, roomTc) => {
          if (screen.matchType === 'matchmaking') {
            toLobby()
            seek()
          } else {
            void createInvite(side, roomTc)
          }
        }}
      />
    )
  }
  if (screen.kind === 'tutorial') {
    return (
      <TutorialGame
        settings={settings}
        onLobby={() => toLobby()}
        onSeek={() => {
          toLobby()
          seek()
        }}
      />
    )
  }
  if (screen.kind === 'bot') {
    return (
      <BotSession
        options={screen.options}
        settings={settings}
        onLobby={() => toLobby()}
        onAgain={() => {
          toLobby()
          seek()
        }}
      />
    )
  }

  // ------------------------------------------------------------ lobby
  const unlocked = ready && isRandomMatchUnlocked()
  const s = mm.state
  const seeking = s.phase === 'seeking' || s.phase === 'found'
  const rating = stats.rating

  return (
    <div className="lobby">
      {message && (
        <p className="online-error" role="alert">
          {message}
        </p>
      )}

      <section className="lobby-card lobby-random">
        <h2>だれかと対局</h2>
        {seeking ? (
          <SeekCard state={s} onCancel={mm.cancel} />
        ) : (
          <>
            <button type="button" className="btn btn-primary lobby-cta" disabled={!ready || !unlocked || busy} onClick={seek}>
              相手を探す
            </button>
            <p className="lobby-meta">
              {stats.playing > 0 && (
                <>
                  <span className="live-dot" aria-hidden="true" />
                  {stats.playing}人が対局中・
                </>
              )}
              1手30秒
            </p>
            {ready && !unlocked && (
              <div className="setting-warn">
                <p>
                  はじめての方は、まず練習対局に勝つか、<a href="/">AIとの対局</a>で1回勝つと、だれかと対局できるようになります。
                </p>
                <button type="button" className="btn btn-primary" onClick={() => setScreen({ kind: 'tutorial' })}>
                  練習対局をはじめる
                </button>
              </div>
            )}
            {ready && unlocked && (
              <button type="button" className="chip" onClick={() => setScreen({ kind: 'tutorial' })}>
                練習対局（COMが手加減します）
              </button>
            )}
          </>
        )}
        <label className="setting-toggle">
          <input
            type="checkbox"
            checked={settings.botFallback}
            disabled={seeking}
            onChange={(e) => changeSettings({ ...settings, botFallback: e.target.checked })}
          />
          <span>
            相手が{stats.botFallbackSeconds ? `${stats.botFallbackSeconds}秒` : 'しばらく'}で見つからないときは、COM（コンピュータ）と対局する
          </span>
        </label>
      </section>

      <section className="lobby-card">
        <h2>あなた</h2>
        <div className="lobby-me">
          <span className="player-name">{shownName(profile.name) || '匿名プレイヤー'}</span>
          <button type="button" className="chip" onClick={() => setNameOpen(true)}>
            名前を変える
          </button>
        </div>
        {rating && !settings.hideRank && (
          <div className="rank-card">
            <RankBadge rank={rating.rank} />
            <span>実力値 {rating.rating}</span>
            <div className="rank-progress" role="progressbar" aria-valuenow={Math.round(rating.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <i style={{ width: `${Math.round(rating.progress * 100)}%` }} />
            </div>
            <span className="setting-note">{rating.nextLabel ? `${rating.nextLabel}まで あと${rating.pointsToNext}` : '最高位です'}</span>
          </div>
        )}
        <label className="setting-toggle">
          <input type="checkbox" checked={settings.hideRank} onChange={(e) => changeSettings({ ...settings, hideRank: e.target.checked })} />
          <span>段級位と実力値を表示しない（相手の段級位も見えなくなります）</span>
        </label>
        <label className="setting-select">
          <span>秒読みの音声</span>
          <select value={settings.byoyomi} onChange={(e) => changeSettings({ ...settings, byoyomi: e.target.value as ShogiSettings['byoyomi'] })}>
            <option value="soft">残り10秒から</option>
            <option value="full">残り30秒から</option>
            <option value="off">読み上げない</option>
          </select>
        </label>
      </section>

      <section className="lobby-card">
        <h2>友だちと対局</h2>
        <p className="setting-note">招待リンクを送ると、相手が開いたときに対局が始まります。相手はリンクを開くだけで参加できます。</p>
        <fieldset className="setting-group">
          <legend>あなたの手番</legend>
          <div className="segmented" role="radiogroup">
            {(
              [
                ['random', 'ランダム'],
                ['sente', '先手'],
                ['gote', '後手'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="segment">
                <input type="radio" name="side-pref" checked={sidePref === value} onChange={() => setSidePref(value)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="setting-select">
          <span>持ち時間</span>
          <select value={tcValue} onChange={(e) => setTcValue(e.target.value)}>
            {TIME_CONTROLS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-primary lobby-cta" disabled={!ready || busy} onClick={() => void createInvite(sidePref, tc)}>
          招待リンクを作る
        </button>
      </section>

      <NameDialog
        open={nameOpen}
        profile={profile}
        onClose={() => setNameOpen(false)}
        onSave={(next) => {
          saveNameProfile(next)
          setProfile(next)
          setNameOpen(false)
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------- matchmaking card

function SeekCard({ state, onCancel }: { state: ReturnType<typeof useMatchmaking>['state']; onCancel: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [])
  if (state.phase === 'found') {
    return (
      <div className="seek-card seek-found" role="status">
        <strong>対局相手が見つかりました</strong>
        <span>
          {shownName(state.opponentName) || '匿名プレイヤー'}さん <RankBadge rank={state.opponentRank} />
        </span>
      </div>
    )
  }
  if (state.phase !== 'seeking') return null
  const left = secondsUntilBot(state, now)
  return (
    <div className="seek-card" role="status">
      <strong>
        対局相手を探しています<span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span>
      </strong>
      {left === null ? (
        <span>見つかりしだい始まります（{formatClock(now - state.since)}）</span>
      ) : left > 0 ? (
        <span>あと{left}秒で見つからなければ、COMと対局します</span>
      ) : (
        <span>まもなくCOMとの対局が始まります…</span>
      )}
      {state.playing > 0 && <span className="lobby-meta">{state.playing}人が対局中</span>}
      <button type="button" className="chip" onClick={onCancel}>
        探すのをやめる
      </button>
    </div>
  )
}

// ---------------------------------------------------------------- a room (friend or random match)

function RoomSession({
  screen,
  settings,
  onLobby,
  onAgain,
}: {
  screen: Extract<Screen, { kind: 'room' }>
  settings: ShogiSettings
  onLobby: (note?: string | null) => void
  onAgain: (side: SidePref, tc: TimeControl) => void
}) {
  const room = useRoomConnection(screen.code, screen.token, {
    initial: screen.initial,
    startTimeoutMs: screen.matchType === 'matchmaking' ? START_TIMEOUT_MS : null,
  })

  useEffect(() => {
    if (room.expired) onLobby('部屋の有効期限が切れました。')
  }, [room.expired])

  useEffect(() => {
    if (room.match?.game_over) markOnlinePlayed()
  }, [room.match?.game_over])

  if (!room.match || !room.yourSide || !room.position) {
    return (
      <div className="lobby">
        <p className="online-connection" role="status">
          {room.error ? room.error.message : '対局室に接続しています…'}
        </p>
        <button type="button" className="btn btn-quiet" onClick={() => onLobby()}>
          ロビーに戻る
        </button>
      </div>
    )
  }

  const match = room.match
  const started = match.sente_joined && match.gote_joined
  if (!started && match.match_type === 'invite') {
    return <FriendWaiting code={match.room_code} tcLabel={tcLabel(match.tc_type, match.tc_seconds)} yourSide={room.yourSide} onCancel={() => onLobby()} />
  }

  const model: OnlineGameModel = {
    kind: 'room',
    match,
    yourSide: room.yourSide,
    position: room.position,
    skewMs: room.skewMs,
    disconnect: room.disconnect,
    connection: room.connection,
    sending: room.sending,
    thinking: false,
    error: room.error?.message ?? null,
    report: null,
    playMove: (move) => void room.sendMove(move),
    resign: () => room.resign(),
  }
  const mySide = room.yourSide
  return (
    <OnlineGame
      model={model}
      settings={settings}
      hideRank={settings.hideRank}
      onLobby={() => onLobby()}
      onAgain={() => onAgain(mySide === 'sente' ? 'gote' : 'sente', { type: match.tc_type, seconds: match.tc_seconds })}
      againLabel={match.match_type === 'matchmaking' ? 'もう一度対局する' : '先後を入れ替えてもう一局'}
    />
  )
}

function tcLabel(type: string, seconds: number): string {
  if (type === 'per_move') return `1手${seconds}秒`
  if (type === 'total') return `持ち時間${Math.round(seconds / 60)}分（切れ負け）`
  return '時間制限なし'
}

function FriendWaiting({ code, tcLabel: label, yourSide, onCancel }: { code: string; tcLabel: string; yourSide: Player; onCancel: () => void }) {
  const url = inviteUrl(code)
  const [copy, setCopy] = useState<'idle' | 'done' | 'failed'>('idle')
  const [qr, setQr] = useState<string | null>(null)
  const text = '将棋で対局しよう！このリンクを開くと始まります'

  async function showQr() {
    try {
      // Loaded only when asked for: most people share the link directly.
      const QRCode = await import('qrcode')
      setQr(await QRCode.toDataURL(url, { margin: 1, width: 220, errorCorrectionLevel: 'M' }))
    } catch {
      setQr(null)
    }
  }

  return (
    <div className="lobby">
      <section className="lobby-card">
        <h2>友だちを待っています</h2>
        <p>このリンクを相手に送ってください。相手が開くと対局が始まります（24時間有効）。</p>
        <input className="invite-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="招待リンク" />
        <div className="kifu-actions">
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <button type="button" className="btn btn-primary" onClick={() => void navigator.share({ text, url }).catch(() => {})}>
              リンクを送る
            </button>
          )}
          <button
            type="button"
            className="chip"
            onClick={() =>
              void navigator.clipboard
                .writeText(url)
                .then(() => setCopy('done'))
                .catch(() => setCopy('failed'))
            }
          >
            {copy === 'done' ? 'コピーしました' : 'リンクをコピー'}
          </button>
          <button type="button" className="chip" onClick={() => openExternal(lineShareUrl(`${text}\n${url}`))}>
            LINEで送る
          </button>
          <button type="button" className="chip" onClick={() => void showQr()}>
            QRコード
          </button>
        </div>
        {copy === 'failed' && (
          <p className="setting-warn" role="alert">
            コピーできませんでした。上のリンクを長押し（右クリック）して選ぶか、QRコードを相手に読み取ってもらってください。
          </p>
        )}
        {qr && <img className="invite-qr" src={qr} width={220} height={220} alt="招待リンクのQRコード" />}
        <p className="setting-note">
          あなたは{yourSide === 'sente' ? '先手' : '後手'}・{label}
        </p>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          やめてロビーに戻る
        </button>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------- a local COM game

function BotSession({
  options,
  settings,
  onLobby,
  onAgain,
}: {
  options: BotGameOptions
  settings: ShogiSettings
  onLobby: () => void
  onAgain: () => void
}) {
  // `options` comes from state, so it stays the same object for the whole game
  // (a new object would start a new game).
  const { snapshot, playMove, resign } = useBotGame(options)
  if (!snapshot) return null
  const model: OnlineGameModel = {
    kind: 'bot',
    match: snapshot.match,
    yourSide: snapshot.yourSide,
    position: snapshot.position,
    skewMs: 0,
    disconnect: { side: null, deadline: null },
    connection: null,
    sending: false,
    thinking: snapshot.thinking,
    error: null,
    report: snapshot.report,
    playMove: (move) => void playMove(move),
    resign,
  }
  return (
    <>
      <p className="bot-banner" role="status">
        相手が見つからなかったため、COM（コンピュータ）と対局します
      </p>
      <OnlineGame model={model} settings={settings} hideRank={settings.hideRank} onLobby={onLobby} onAgain={onAgain} againLabel="もう一度対局する" />
    </>
  )
}
