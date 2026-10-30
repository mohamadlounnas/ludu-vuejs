import { watch } from 'vue'
import { progress } from './progress'
import { createRng } from './rng'
import { audioGraph, BARS, mallet } from './sfx'

/**
 * A calm generative lullaby, so the game is never silent: a music box over
 * a soft warm pad, C major pentatonic, in 3/4 at 74 BPM. Phrases are 8 bars
 * on I-vi-IV-V with plenty of rests, each composed afresh from its own seed
 * (a motif that comes back halfway keeps it a tune), so it never loops.
 *
 * Notes are scheduled a little ahead on the audio clock by a 50ms timer.
 * The music shares the sound kit's context, so it pauses with the page,
 * and it plays far under the sounds (see `masterChain`).
 */

const BEAT = 60 / 74
const BAR = 3 * BEAT
/** Notes due within this many seconds are scheduled at each tick. */
const AHEAD = 0.3
const TICK_MS = 50
const FADE_IN = 3
const FADE_OUT = 1.2

/** C major pentatonic from C4 to E6 (a degree's note is degree % 5: C D E G A). */
const SCALE = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51]
/** The melody stays between C5 and E6. */
const LOW = 5
const HIGH = 12

/** I-vi-IV-V, two bars each: the chord's notes in the scale (degree % 5), the pad's voicing and the bass. */
const CHORDS = [
  { tones: [0, 2, 3], pad: [130.81, 196, 329.63], bass: 130.81 },
  { tones: [4, 0, 2], pad: [110, 164.81, 261.63], bass: 110 },
  { tones: [4, 0], pad: [87.31, 130.81, 220], bass: 174.61 },
  { tones: [3, 1], pad: [98, 146.83, 246.94], bass: 196 },
]

/** A bar's melody rhythm in eighths (0-5), and how often it comes up: mostly one or two notes. */
const RHYTHMS: readonly (readonly [readonly number[], number])[] = [
  [[0], 3],
  [[0, 2], 3],
  [[0, 4], 2],
  [[0, 2, 4], 2],
  [[0, 3, 4], 1],
  [[0, 3], 1],
  [[2, 4], 1],
]

interface Note {
  /** Seconds from the start of the music. */
  at: number
  voice: 'melody' | 'pad' | 'bass'
  freqs: readonly number[]
  gain: number
  /** How long it holds (s). */
  dur: number
}

function weighted<T>(rng: () => number, options: readonly (readonly [T, number])[]): T {
  let r = rng() * options.reduce((sum, [, w]) => sum + w, 0)
  for (const [option, w] of options) if ((r -= w) < 0) return option
  return options[0][0]
}

/** The melody's next degree: mostly a step, sometimes a skip, leaning back to the middle; on a beat, a chord tone. */
function nextDegree(rng: () => number, from: number, tones: readonly number[] | null): number {
  const r = rng()
  const size = r < 0.12 ? 0 : r < 0.7 ? 1 : r < 0.92 ? 2 : 3
  const up = rng() < 0.5 + (8.5 - from) * 0.08
  let to = Math.min(HIGH, Math.max(LOW, from + (up ? size : -size)))
  if (tones) {
    for (let d = 0; d <= 2; d++) {
      if (to + d <= HIGH && tones.includes((to + d) % 5)) return to + d
      if (to - d >= LOW && tones.includes((to - d) % 5)) return to - d
    }
  }
  return to
}

/** The music, note by note, forever. */
function* compose(seed: number): Generator<Note, never> {
  let degree = 7
  for (let phrase = 0; ; phrase++) {
    const rng = createRng(seed + phrase * 7919)
    const pick = () => weighted(rng, RHYTHMS)
    const motif = [pick(), pick()]
    for (let bar = 0; bar < 8; bar++) {
      const at = (phrase * 8 + bar) * BAR
      const chord = CHORDS[bar >> 1]
      if (bar % 2 === 0) {
        yield { at, voice: 'pad', freqs: chord.pad, gain: 1, dur: 2 * BAR }
        yield { at, voice: 'bass', freqs: [chord.bass], gain: 0.8 + 0.2 * rng(), dur: 1.6 }
      }
      // Bars 4 and 8 breathe; bars 5-6 bring the opening motif back.
      const breathe = bar === 3 || bar === 7
      const echo = bar < 2 ? motif[bar] : bar === 4 || bar === 5 ? motif[bar - 4] : null
      const rhythm = breathe ? (rng() < 0.4 ? [] : [0]) : (echo ?? pick())
      for (const slot of rhythm) {
        if (slot > 0 && rng() < 0.12) continue
        degree = nextDegree(rng, degree, slot === 0 ? chord.tones : null)
        const freq = SCALE[degree]
        yield {
          at: at + (slot * BEAT) / 2,
          voice: 'melody',
          freqs: [freq],
          gain: (slot === 0 ? 1 : 0.72) * (0.85 + 0.15 * rng()),
          // A long note at a phrase's breath, else as long as the tooth rings.
          dur: (bar === 3 || bar === 7 ? 2 : 1.3) * (523 / freq) ** 0.5,
        }
      }
    }
  }
}

/** A very soft warm pad: each chord tone a slowly beating pair of triangles, low-passed, swelling in and out. */
function pad(ac: BaseAudioContext, out: AudioNode, t0: number, freqs: readonly number[], hold: number, gain: number) {
  const warm = ac.createBiquadFilter()
  warm.type = 'lowpass'
  warm.frequency.value = 650
  warm.Q.value = -3
  const level = ac.createGain()
  level.gain.setValueAtTime(0, t0)
  level.gain.linearRampToValueAtTime(gain, t0 + 1.6)
  level.gain.setValueAtTime(gain, t0 + hold)
  level.gain.linearRampToValueAtTime(0, t0 + hold + 2)
  warm.connect(level).connect(out)
  for (const f of freqs) {
    for (const cents of [-3, 3]) {
      const osc = ac.createOscillator()
      osc.type = 'triangle'
      osc.frequency.value = f * 2 ** (cents / 1200)
      osc.connect(warm)
      osc.start(t0)
      osc.stop(t0 + hold + 2.05)
    }
  }
}

function play(ac: BaseAudioContext, out: AudioNode, t: number, note: Note) {
  const [freq] = note.freqs
  if (note.voice === 'melody') mallet(ac, out, t, freq, 0.05 * note.gain, BARS.musicBox, note.dur)
  else if (note.voice === 'bass') mallet(ac, out, t, freq, 0.035 * note.gain, BARS.felt, note.dur)
  else pad(ac, out, t, note.freqs, note.dur, 0.008)
}

/** The music's way in: a fade-in from `begin`, and a little darker than the sounds, as if from the next room. */
function chain(ac: BaseAudioContext, out: AudioNode, begin: number) {
  const gate = ac.createGain()
  gate.gain.setValueAtTime(0, begin)
  gate.gain.linearRampToValueAtTime(1, begin + FADE_IN)
  gate.connect(out)
  const soft = ac.createBiquadFilter()
  soft.type = 'lowpass'
  soft.frequency.value = 4500
  soft.Q.value = -3
  soft.connect(gate)
  return { gate, input: soft }
}

/** Renders `seconds` of the music from `seed` into any context (the `?soundlab` page renders it offline). */
export function renderMusic(ac: BaseAudioContext, out: AudioNode, t0: number, seconds: number, seed = 1) {
  const { input } = chain(ac, out, t0)
  const notes = compose(seed)
  for (let note = notes.next().value; note.at < seconds; note = notes.next().value) play(ac, input, t0 + note.at, note)
}

interface Run {
  ctx: AudioContext
  gate: GainNode
  input: AudioNode
  /** When the music began, on the audio clock. */
  begin: number
  notes: Generator<Note, never>
  next: Note
  timer: number
}
let run: Run | null = null

/** Schedules every note due before the look-ahead horizon. One already late is dropped, so nothing ever bunches up. */
function pump() {
  if (!run) return
  const now = run.ctx.currentTime
  while (run.begin + run.next.at < now + AHEAD) {
    const t = run.begin + run.next.at
    if (t > now - 0.05) play(run.ctx, run.input, Math.max(t, now), run.next)
    run.next = run.notes.next().value
  }
}

export const music = {
  /**
   * Plays the music from the first user gesture on (browsers only start
   * sound after one) while sound and music are both on, and follows those
   * settings from then on. Call once.
   */
  attach() {
    if (typeof window === 'undefined') return
    const wanted = () => progress.settings.sound && progress.settings.music
    let allowed = false
    const gestures = ['pointerup', 'keydown', 'touchend'] as const
    const onGesture = () => {
      allowed = true
      for (const type of gestures) window.removeEventListener(type, onGesture, true)
      if (wanted()) music.start()
    }
    for (const type of gestures) window.addEventListener(type, onGesture, true)
    watch(wanted, (on) => {
      if (!allowed) return
      if (on) music.start()
      else music.stop()
    })
  },
  /** Fades the music in (if sound is on). */
  start() {
    if (run || typeof window === 'undefined') return
    const g = audioGraph()
    if (!g) return
    const begin = g.ctx.currentTime + 0.1
    const { gate, input } = chain(g.ctx, g.musicBus, begin)
    const notes = compose(Math.floor(Math.random() * 2 ** 31))
    run = { ctx: g.ctx, gate, input, begin, notes, next: notes.next().value, timer: window.setInterval(pump, TICK_MS) }
    pump()
  },
  /** Fades the music out; what's still ringing dies away under the fade. */
  stop() {
    if (!run) return
    const { ctx, gate, timer } = run
    run = null
    window.clearInterval(timer)
    const now = ctx.currentTime
    gate.gain.cancelScheduledValues(now)
    gate.gain.setValueAtTime(gate.gain.value, now)
    gate.gain.linearRampToValueAtTime(0, now + FADE_OUT)
    window.setTimeout(() => gate.disconnect(), (FADE_OUT + 4) * 1000)
  },
}
