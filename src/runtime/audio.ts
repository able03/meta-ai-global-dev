// Retro chiptune music and sound effects, synthesized live with Web Audio.
// The tune is an original composition written below as note numbers, so there is
// nothing to license: it ships under the project's MIT license like the rest of the code.

type Wave = OscillatorType

// MIDI note numbers; null = rest. Eight eighth-notes per bar, chords C – Am – F – G.
const MELODY: (number | null)[][] = [
  [72, 76, 79, 76, 74, 76, 72, null],
  [69, 72, 76, 72, 74, 72, 69, null],
  [65, 69, 72, 69, 70, 72, 74, 76],
  [74, 71, 67, 71, 74, null, 79, null],
  [79, 77, 76, 74, 76, 79, 84, null],
  [81, 79, 76, 72, 74, 76, 72, null],
  [77, 76, 74, 72, 74, 77, 76, 74],
  [71, 74, 79, 77, 74, 71, 72, null],
]
const BASS_ROOTS = [48, 45, 41, 43, 48, 45, 41, 43]
const BPM = 132
const EIGHTH = 60 / BPM / 2

const freq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)

class RetroAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private music: GainNode | null = null
  private noise: AudioBuffer | null = null
  private timer: number | null = null
  private nextTime = 0
  private step = 0
  enabled = true

  /** Must be called from a click or key press — browsers only allow sound after a gesture. */
  private ensure(): AudioContext | null {
    if (!this.enabled) return null
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.14
      this.master.connect(this.ctx.destination)
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate)
      const data = this.noise.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  setEnabled(on: boolean): void {
    this.enabled = on
    if (!on) this.stopMusic()
  }

  // ---------------------------------------------------------------------------
  // Music

  /** Starts the song. Does nothing if it's already playing, so it can never play twice at once. */
  startMusic(): void {
    const ctx = this.ensure()
    if (!ctx || this.timer !== null) return
    // Each run gets its own volume channel, so stopping can silence notes already queued.
    this.music = ctx.createGain()
    this.music.connect(this.master!)
    this.step = 0
    this.nextTime = ctx.currentTime + 0.08
    this.timer = window.setInterval(() => this.schedule(), 25)
  }

  stopMusic(): void {
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
    const bus = this.music
    this.music = null
    if (bus && this.ctx) {
      bus.gain.setValueAtTime(0, this.ctx.currentTime) // cut notes that were scheduled ahead
      window.setTimeout(() => bus.disconnect(), 300)
    }
  }

  /** Stops everything and releases the audio device. */
  dispose(): void {
    this.stopMusic()
    void this.ctx?.close()
    this.ctx = null
  }

  get musicPlaying(): boolean {
    return this.timer !== null
  }

  /** Schedules notes a little ahead of time so the beat stays steady. */
  private schedule(): void {
    const ctx = this.ctx
    const bus = this.music
    if (!ctx || !bus) return
    // A background tab can pause the timer; skip the missed notes instead of playing them all at once.
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.02
    while (this.nextTime < ctx.currentTime + 0.12) {
      const bar = Math.floor(this.step / 8) % MELODY.length
      const beat = this.step % 8
      const t = this.nextTime
      const note = MELODY[bar][beat]
      if (note !== null) this.tone(freq(note), t, EIGHTH * 0.85, 'square', 0.32, bus)
      const root = BASS_ROOTS[bar]
      this.tone(freq(beat % 2 ? root + 12 : root), t, EIGHTH * 0.9, 'triangle', 0.55, bus)
      if (beat % 4 === 0) this.sweep(150, 45, t, 0.14, 'sine', 0.9, bus)
      if (beat % 4 === 2) this.hiss(t, 0.12, 0.35, 1800, bus)
      this.hiss(t, 0.03, 0.12, 7000, bus)
      this.nextTime += EIGHTH
      this.step++
    }
  }

  // ---------------------------------------------------------------------------
  // Sound effects for `play coin sound`

  sfx(name: string): void {
    const ctx = this.ensure()
    if (!ctx) return
    const t = ctx.currentTime + 0.01
    switch (name) {
      case 'coin':
        this.tone(988, t, 0.07, 'square', 0.5)
        this.tone(1319, t + 0.07, 0.18, 'square', 0.5)
        break
      case 'jump':
        this.sweep(300, 760, t, 0.16, 'square', 0.45)
        break
      case 'hit':
        this.hiss(t, 0.14, 0.7, 900)
        this.sweep(220, 55, t, 0.18, 'sawtooth', 0.4)
        break
      case 'win':
        ;[72, 76, 79, 84].forEach((n, i) => this.tone(freq(n), t + i * 0.1, 0.12, 'square', 0.45))
        this.tone(freq(88), t + 0.42, 0.35, 'square', 0.45)
        break
      case 'lose':
        ;[67, 64, 60].forEach((n, i) => this.tone(freq(n), t + i * 0.16, 0.18, 'sawtooth', 0.35))
        this.sweep(freq(55), freq(48), t + 0.5, 0.45, 'sawtooth', 0.35)
        break
      case 'laser':
        this.sweep(1500, 180, t, 0.22, 'square', 0.35)
        break
      case 'powerup':
        for (let i = 0; i < 8; i++) this.tone(freq(60 + i * 3), t + i * 0.045, 0.06, 'square', 0.4)
        break
      case 'boop':
      default:
        this.tone(523, t, 0.1, 'sine', 0.6)
    }
  }

  // ---------------------------------------------------------------------------
  // Building blocks

  private tone(hz: number, at: number, dur: number, wave: Wave, vol: number, out?: AudioNode): void {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = wave
    osc.frequency.setValueAtTime(hz, at)
    gain.gain.setValueAtTime(vol, at)
    gain.gain.exponentialRampToValueAtTime(0.001, at + dur)
    osc.connect(gain).connect(out ?? this.master!)
    osc.start(at)
    osc.stop(at + dur + 0.02)
  }

  private sweep(from: number, to: number, at: number, dur: number, wave: Wave, vol: number, out?: AudioNode): void {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = wave
    osc.frequency.setValueAtTime(from, at)
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + dur)
    gain.gain.setValueAtTime(vol, at)
    gain.gain.exponentialRampToValueAtTime(0.001, at + dur)
    osc.connect(gain).connect(out ?? this.master!)
    osc.start(at)
    osc.stop(at + dur + 0.02)
  }

  private hiss(at: number, dur: number, vol: number, cutoff: number, out?: AudioNode): void {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = cutoff
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(vol, at)
    gain.gain.exponentialRampToValueAtTime(0.001, at + dur)
    src.connect(filter).connect(gain).connect(out ?? this.master!)
    src.start(at)
    src.stop(at + dur + 0.02)
  }
}

// One player for the whole page — even when the dev server hot-reloads this file —
// so the song can never be playing twice.
const holder = globalThis as typeof globalThis & { __sayntaxAudio?: RetroAudio }
holder.__sayntaxAudio?.dispose()
export const audio = (holder.__sayntaxAudio = new RetroAudio())

import.meta.hot?.dispose(() => audio.dispose())
