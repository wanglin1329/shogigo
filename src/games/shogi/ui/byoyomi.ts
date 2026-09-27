// SPDX-License-Identifier: GPL-3.0-only

import type { Byoyomi } from './settings'

// Spoken countdown for my own clock in timed games: Japanese speech when the
// device has a Japanese voice, a short beep otherwise.

let beepCtx: AudioContext | null = null

function beep() {
  try {
    beepCtx ??= new AudioContext()
    const t = beepCtx.currentTime
    const osc = beepCtx.createOscillator()
    const gain = beepCtx.createGain()
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.2, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15)
    osc.connect(gain).connect(beepCtx.destination)
    osc.start(t)
    osc.stop(t + 0.16)
  } catch {
    // No audio: stay silent.
  }
}

function japaneseVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null
  return speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('ja')) ?? null
}

function say(text: string) {
  const voice = japaneseVoice()
  if (!voice) {
    beep()
    return
  }
  const u = new SpeechSynthesisUtterance(text)
  u.voice = voice
  u.lang = 'ja-JP'
  u.rate = 1.1
  speechSynthesis.cancel()
  speechSynthesis.speak(u)
}

/**
 * Seconds at which to speak, by time control. The last five seconds always
 * count down; 'soft' only adds the 10-second call.
 */
function marks(mode: Byoyomi, perMove: boolean): number[] {
  if (mode === 'off') return []
  const countdown = [5, 4, 3, 2, 1]
  if (mode === 'soft') return [10, ...countdown]
  return [...(perMove ? [30, 20] : [60, 30]), 10, ...countdown]
}

/**
 * Call on every clock tick with my remaining whole seconds; speaks the most
 * recently passed mark once. Returns the new "last spoken" value to keep.
 *
 * At the start of each of my turns, seed `lastSpoken` with the remaining
 * seconds: marks at or above it are skipped (no 「残り30秒」 the moment a
 * 30-second turn begins).
 */
export function announce(
  remainingSeconds: number,
  lastSpoken: number,
  mode: Byoyomi,
  perMove: boolean,
): number {
  const passed = marks(mode, perMove).filter((m) => remainingSeconds <= m && m < lastSpoken)
  if (passed.length === 0) return lastSpoken
  // After a jump (hidden tab), only the latest mark is worth saying.
  const mark = Math.min(...passed)
  say(mark > 5 ? `残り${mark}秒` : String(mark))
  return mark
}
