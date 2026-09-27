// SPDX-License-Identifier: GPL-3.0-only

// Move feedback: a synthesized wooden "click" (no audio file to download or
// license) and a short vibration on phones.

let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
    // 40 ms of decaying noise: the "tap" of wood on wood.
    const length = Math.floor(ctx.sampleRate * 0.04)
    noise = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3
  }
  return ctx
}

/**
 * Browsers only allow audio after a user gesture. Call from the first
 * pointerdown so the very first move is not silent.
 */
export function unlockAudio(): void {
  const c = audio()
  if (c && c.state === 'suspended') void c.resume()
}

export function playMoveSound(): void {
  const c = audio()
  if (!c || !noise || c.state !== 'running') return
  const t = c.currentTime
  const src = c.createBufferSource()
  src.buffer = noise
  const band = c.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 1800
  band.Q.value = 1.2
  const tapGain = c.createGain()
  tapGain.gain.value = 0.9
  src.connect(band).connect(tapGain).connect(c.destination)
  src.start(t)

  // A short low thump gives the board some body.
  const osc = c.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(190, t)
  osc.frequency.exponentialRampToValueAtTime(90, t + 0.08)
  const thump = c.createGain()
  thump.gain.setValueAtTime(0.35, t)
  thump.gain.exponentialRampToValueAtTime(0.001, t + 0.09)
  osc.connect(thump).connect(c.destination)
  osc.start(t)
  osc.stop(t + 0.1)
}

export function vibrate(): void {
  // Chrome refuses (and logs an error) before the first user gesture.
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return
  try {
    navigator.vibrate?.(8)
  } catch {
    // Unsupported or blocked.
  }
}
