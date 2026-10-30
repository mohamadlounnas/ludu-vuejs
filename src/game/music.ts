import { watch } from 'vue'
import { progress } from './progress'
import { createRng } from './rng'
import { audioGraph, meow, type MeowKind } from './sfx'

/**
 * The "music" is a room full of cats: a few of them, each with a voice of
 * its own and a place in the room, meowing now and then in no set order.
 * Sometimes one calls alone, sometimes another answers, sometimes one asks
 * twice, and now and then they all chime in at once. Every call is pitched
 * to C major pentatonic, so however they pile up it never jars.
 *
 * Calls are scheduled a little ahead on the audio clock by a 50ms timer.
 * The music shares the sound kit's context, so it pauses with the page,
 * and it plays far under the sounds (see `masterChain`).
 */

/** Calls due within this many seconds are scheduled at each tick. */
const AHEAD = 0.3
const TICK_MS = 50
const FADE_IN = 0.3
const FADE_OUT = 1.2

/** C major pentatonic, A4 to C6: every cat's call starts on one of these. */
const SCALE = [440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5]

/** The cast: a home note (index into SCALE), a place in the room (-1 left .. 1 right), how near, and how they like to talk. */
const CATS = [
  { note: 1, pan: -0.45, near: 1, kinds: [['mew', 4], ['happy', 3], ['chirp', 1]] },
  { note: 3, pan: 0.5, near: 0.95, kinds: [['mew', 3], ['chirp', 3], ['happy', 1]] },
  { note: 5, pan: 0.1, near: 0.7, kinds: [['mew', 4], ['chirp', 2], ['sad', 1]] },
  { note: 0, pan: 0.25, near: 0.75, kinds: [['happy', 2], ['mew', 2], ['grumble', 1]] },
] as const

/** Each call's own pitch next to a mew's (a happy "mrr-ow" starts a little lower, a sad one lower still). */
const PITCH: Record<MeowKind, number> = { mew: 1, chirp: 1, happy: 0.94, sad: 0.85, grumble: 1 }

/** What happens next: one call alone, an answer, the same cat twice, or everyone. */
const SCENES = [
  ['solo', 5],
  ['answer', 3],
  ['twice', 2],
  ['chorus', 1],
] as const

interface Note {
  /** Seconds from the start of the music. */
  at: number
  kind: MeowKind
  /** Starting pitch (Hz). */
  f0: number
  gain: number
  pan: number
}

function weighted<T>(rng: () => number, options: readonly (readonly [T, number])[]): T {
  let r = rng() * options.reduce((sum, [, w]) => sum + w, 0)
  for (const [option, w] of options) if ((r -= w) < 0) return option
  return options[0][0]
}

/** The cats, call by call, forever. */
function* compose(seed: number): Generator<Note, never> {
  const rng = createRng(seed)
  const between = (a: number, b: number) => a + rng() * (b - a)
  const otherCat = (not: number) => (not + 1 + Math.floor(rng() * (CATS.length - 1))) % CATS.length
  /** One call from cat `c`, `step` scale notes off its home note. */
  const call = (at: number, c: number, step = 0, kind?: MeowKind): Note => {
    const cat = CATS[c]
    const k = kind ?? weighted(rng, cat.kinds)
    const note = Math.min(SCALE.length - 1, Math.max(0, cat.note + step + (rng() < 0.3 ? (rng() < 0.5 ? -1 : 1) : 0)))
    return { at, kind: k, f0: SCALE[note] * PITCH[k], gain: 0.4 * cat.near * between(0.8, 1.1), pan: cat.pan + between(-0.1, 0.1) }
  }

  let t = 0.15
  let last = 0
  for (;;) {
    const scene = weighted(rng, SCENES)
    const c = rng() < 0.6 ? otherCat(last) : last
    if (scene === 'solo') {
      yield call(t, c)
    } else if (scene === 'answer') {
      yield call(t, c)
      t += between(0.6, 1.1)
      yield call(t, otherCat(c))
    } else if (scene === 'twice') {
      // Asking again, a note higher and more insistent.
      yield call(t, c, 0, 'mew')
      t += between(0.45, 0.7)
      yield call(t, c, 1, rng() < 0.5 ? 'mew' : 'happy')
    } else {
      // Everyone at once, tumbling over each other.
      const order = [...CATS.keys()].sort(() => rng() - 0.5)
      for (const k of order) {
        yield call(t, k)
        t += between(0.18, 0.4)
      }
    }
    last = c
    t += between(1.4, 4.2)
  }
}

function play(ac: BaseAudioContext, out: AudioNode, t: number, note: Note) {
  let to = out
  // The tests' stand-in context has no panner: there the cats just sit in the middle.
  if (typeof ac.createStereoPanner === 'function') {
    const panner = ac.createStereoPanner()
    panner.pan.value = Math.max(-1, Math.min(1, note.pan))
    panner.connect(out)
    to = panner
  }
  meow(ac, to, t, note.kind, note.kind === 'grumble' ? undefined : note.f0, note.gain)
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
