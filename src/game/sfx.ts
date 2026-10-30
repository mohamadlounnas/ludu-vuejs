import { progress } from './progress'

/**
 * Synthesized sound kit (WebAudio, no files) and haptics. Every sound
 * respects the sound setting; haptics respect the vibration setting.
 *
 * Sounds follow the picture: each one is scheduled on the audio clock at
 * the moment its animation shows it (`delay` ms from now), never with
 * timers, so a wave of X's plinks exactly as its X's draw.
 *
 * They are modelled on real things rather than bare beeps: plinks are
 * struck bars (a fundamental plus inharmonic overtones that die faster),
 * the cat meows through a mouth whose formants move, the pen is graphite
 * on paper, and everything plays in one small soft room. Each sound is a
 * voice `(ac, out, t0, ...)`, a pure function of a context, so the same
 * code plays live and renders offline (the `?soundlab` page). Small random
 * nudges keep a repeated sound from ever coming out identical.
 */

type Ctx = BaseAudioContext
type Points = readonly (readonly [number, number])[]

/** As close to silence as exponential ramps go (they can't reach 0). */
const SILENT = 0.0001

/** A random value between `a` and `b`. */
const rand = (a: number, b: number) => a + Math.random() * (b - a)
/** `x`, nudged by up to ±`amount` (0.06 is ±6%). */
const vary = (x: number, amount: number) => x * (1 + (Math.random() * 2 - 1) * amount)

/** `points` ([x, y], x ascending) joined by straight lines, read at `x`. */
function interp(points: Points, x: number): number {
  let i = 1
  while (i < points.length - 1 && points[i][0] < x) i++
  const [x0, y0] = points[i - 1]
  const [x1, y1] = points[i]
  return y0 + (y1 - y0) * Math.min(1, Math.max(0, (x - x0) / (x1 - x0 || 1)))
}

// ---- Building blocks ----

function amp(ac: Ctx, gain: number): GainNode {
  const node = ac.createGain()
  node.gain.value = gain
  return node
}

/** A biquad; `q` is linear for band-pass, in dB for low- and high-pass (as WebAudio has it). */
function filter(ac: Ctx, type: BiquadFilterType, freq: number, q: number): BiquadFilterNode {
  const node = ac.createBiquadFilter()
  node.type = type
  node.frequency.value = freq
  node.Q.value = q
  return node
}

/** A gain rising from silence at `t0` through `points` ([s after t0, level]) on exponential ramps, as real sounds do. */
function contour(ac: Ctx, t0: number, points: Points): GainNode {
  const node = ac.createGain()
  node.gain.setValueAtTime(SILENT, t0)
  for (const [at, level] of points) node.gain.exponentialRampToValueAtTime(Math.max(level, SILENT), t0 + at)
  return node
}

/** A quick attack, then an exponential fade to silence `decay` s later. */
const envelope = (ac: Ctx, t0: number, gain: number, attack: number, decay: number) =>
  contour(ac, t0, [[attack, gain], [attack + decay, SILENT]])

function oscillator(ac: Ctx, type: OscillatorType, freq: number, t0: number, end: number): OscillatorNode {
  const node = ac.createOscillator()
  node.type = type
  node.frequency.setValueAtTime(freq, t0)
  node.start(t0)
  node.stop(end)
  return node
}

const TEXTURE_SECONDS = 2

interface Textures {
  white: AudioBuffer
  /** Paper under a pencil: noise roughened by the paper's grain, with the odd fibre catching. */
  paper: AudioBuffer
  /**
   * Our own copy of the paper, to read: once playing, a buffer's arrays
   * may be detached or copied on every read (as the spec has it).
   */
  paperData: Float32Array
  /** The paper's overall RMS. */
  paperRms: number
}
/** Per context, so an offline render makes its own. */
const textureCache = new WeakMap<Ctx, Textures>()

function textures(ac: Ctx): Textures {
  const cached = textureCache.get(ac)
  if (cached) return cached
  const rate = ac.sampleRate
  const length = Math.round(rate * TEXTURE_SECONDS)
  const white = ac.createBuffer(1, length, rate)
  const paper = ac.createBuffer(1, length, rate)
  const w = white.getChannelData(0)
  const p = paper.getChannelData(0)
  // The grain: noise smoothed to ~120 Hz, used as a rough, ever-changing pressure.
  const k = 1 - Math.exp((-2 * Math.PI * 120) / rate)
  const grain = new Float32Array(length)
  let a = 0
  let b = 0
  let power = 0
  for (let i = 0; i < length; i++) {
    a += k * (Math.random() * 2 - 1 - a)
    b += k * (a - b)
    grain[i] = b
    power += b * b
  }
  const norm = 1 / Math.sqrt(power / length || 1)
  const paperData = new Float32Array(length)
  let paperPower = 0
  for (let i = 0; i < length; i++) {
    w[i] = Math.random() * 2 - 1
    const pressure = Math.max(0.05, 0.55 + 0.6 * grain[i] * norm)
    const fibre = Math.random() < 200 / rate ? (Math.random() * 2 - 1) * 1.6 : 0
    paperData[i] = (Math.random() * 2 - 1) * pressure + fibre
    paperPower += paperData[i] * paperData[i]
  }
  p.set(paperData)
  const made = { white, paper, paperData, paperRms: Math.sqrt(paperPower / length) }
  textureCache.set(ac, made)
  return made
}

/** Noise from a texture, from `offset` (s) or a random spot, so no two bursts sound alike. */
function noise(ac: Ctx, buffer: AudioBuffer, t0: number, end: number, offset?: number): AudioBufferSourceNode {
  const node = ac.createBufferSource()
  node.buffer = buffer
  node.start(t0, offset ?? Math.random() * Math.max(0, TEXTURE_SECONDS - (end - t0) - 0.01))
  node.stop(end)
  return node
}

/**
 * Paper noise for a stroke, and a gain that evens out how loud its stretch
 * of paper happens to be: the grain within a stroke is the charm, a 10 dB
 * lottery between strokes isn't.
 */
function paperNoise(ac: Ctx, t0: number, end: number): [AudioBufferSourceNode, number] {
  const { paper, paperData, paperRms } = textures(ac)
  const offset = Math.random() * (TEXTURE_SECONDS - (end - t0) - 0.01)
  const from = Math.floor(offset * ac.sampleRate)
  const n = Math.max(1, Math.floor((end - t0) * ac.sampleRate))
  let power = 0
  for (let i = from; i < from + n; i++) power += paperData[i] * paperData[i]
  const rms = Math.sqrt(power / n)
  return [noise(ac, paper, t0, end, offset), rms > 0 ? paperRms / rms : 1]
}

// ---- The room and the buses ----

/** Share of the room in what you hear: its tail carries ROOM² of the energy (about -16 dB), a touch of air. */
const ROOM = 0.16
/** The music sits far under the sounds. */
const MUSIC_LEVEL = 0.15

/**
 * A small soft room: stereo noise dying away over ~1.1 s, the highs first,
 * after a short pre-delay and a few early reflections. Scaled to unit
 * energy per channel, so ROOM alone sets how much of it you hear.
 */
function roomImpulse(ac: Ctx): AudioBuffer {
  const rate = ac.sampleRate
  const length = Math.round(rate * 1.3)
  const ir = ac.createBuffer(2, length, rate)
  const pre = Math.round(rate * 0.016)
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch)
    // A few early reflections off near walls: short bursts in the first 30 ms.
    for (let r = 0; r < 5; r++) {
      const at = pre + Math.round(rate * rand(0.001, 0.03))
      const level = rand(0.5, 1) * (Math.random() < 0.5 ? -1 : 1)
      for (let i = 0; i < 48 && at + i < length; i++) data[at + i] += level * (Math.random() * 2 - 1) * Math.exp(-i / 12)
    }
    let lp = 0
    for (let i = pre; i < length; i++) {
      const t = (i - pre) / rate
      const cutoff = 1500 + 8000 * Math.exp(-t * 2.5)
      lp += (1 - Math.exp((-2 * Math.PI * cutoff) / rate)) * (Math.random() * 2 - 1 - lp)
      // -60 dB by 1.1 s, the diffuse tail building up over its first 25 ms.
      data[i] += lp * Math.exp((-6.9 * t) / 1.1) * Math.min(1, t / 0.025)
    }
    let energy = 0
    for (let i = 0; i < length; i++) energy += data[i] * data[i]
    const scale = 1 / Math.sqrt(energy || 1)
    for (let i = 0; i < length; i++) data[i] *= scale
  }
  return ir
}

export interface Buses {
  sfxBus: GainNode
  musicBus: GainNode
}

/**
 * Sounds and music into one small room and a gentle compressor, so
 * stacked sounds never clip. Works on any context, live or offline.
 */
export function masterChain(ac: Ctx, out: AudioNode = ac.destination): Buses {
  const squash = ac.createDynamicsCompressor()
  squash.threshold.value = -18
  squash.knee.value = 12
  squash.ratio.value = 4
  squash.attack.value = 0.003
  squash.release.value = 0.2
  squash.connect(out)
  const sfxBus = amp(ac, 0.55)
  const musicBus = amp(ac, 0.55 * MUSIC_LEVEL)
  sfxBus.connect(squash)
  musicBus.connect(squash)
  // The room needs a ConvolverNode (the tests' stand-in context has none: it just stays dry).
  if (typeof ac.createConvolver === 'function') {
    const room = ac.createConvolver()
    room.normalize = false
    room.buffer = roomImpulse(ac)
    // A small soft room doesn't boom: only what's above the lows rings in it.
    const send = filter(ac, 'highpass', 280, -3)
    send.connect(room)
    sfxBus.connect(amp(ac, ROOM)).connect(send)
    // The music is a little further away.
    musicBus.connect(amp(ac, ROOM * 1.8)).connect(send)
    room.connect(squash)
  }
  return { sfxBus, musicBus }
}

export interface Graph extends Buses {
  ctx: AudioContext
}
let graph: Graph | null = null

const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'

/**
 * The live context and its buses, made on first use (call it from a user
 * gesture: browsers only start sound after one), woken if asleep; null
 * with sound off. The music shares it, so it pauses with the page too.
 */
export function audioGraph(): Graph | null {
  if (!progress.settings.sound || typeof AudioContext === 'undefined') return null
  if (!graph) {
    const ctx = new AudioContext()
    graph = { ctx, ...masterChain(ctx) }
  }
  if (graph.ctx.state !== 'running' && !hidden()) void graph.ctx.resume()
  return graph
}

// The page in the background is silent; it picks up where it was when it comes back.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!graph) return
    if (hidden()) void graph.ctx.suspend()
    else void graph.ctx.resume()
  })
}

// ---- Struck bars: every plink, chime and knock ----

/** How a struck bar, tine or block rings. */
export interface Bar {
  /** The exciter: its harmonics are what the strike feeds the overtones. */
  wave: OscillatorType
  /** How long the fundamental rings (s, to silence). */
  ring: number
  /** The fundamental starts this bright (a low-pass at `bright` × f) and mellows as it rings. */
  bright: number
  /** Overtones: [ratio to the fundamental, level, ring (s)]. The higher ones die sooner, as in real bars. */
  modes: readonly (readonly [number, number, number])[]
  /** The click of the strike, relative to the fundamental. */
  tick: number
  /** Mallet contact time (s): a hard mallet is brief and wakes the high overtones; a soft one is round. */
  contact: number
}

export const BARS = {
  /** A kalimba tine: a round fundamental, a quiet metallic overtone near 6× that dies fast. */
  kalimba: { wave: 'triangle', ring: 0.45, bright: 3, modes: [[5.97, 0.18, 0.08]], tick: 0.1, contact: 0.0006 },
  /** A music box tooth: nearly pure, with a shimmer that lingers. */
  musicBox: { wave: 'triangle', ring: 0.9, bright: 2, modes: [[6.27, 0.2, 0.14]], tick: 0.08, contact: 0.0004 },
  /** A glass chime (a free bar, 1 : 2.76 : 5.40 : 8.93): bell-like sparkle. */
  glass: {
    wave: 'triangle',
    ring: 0.6,
    bright: 2,
    modes: [[2.756, 0.4, 0.28], [5.404, 0.2, 0.1], [8.933, 0.08, 0.04]],
    tick: 0.05,
    contact: 0.0004,
  },
  /** A rosewood bar on a soft mallet: warm and round. */
  marimba: {
    wave: 'triangle',
    ring: 0.45,
    bright: 2.2,
    modes: [[3.93, 0.25, 0.07], [9.2, 0.08, 0.02]],
    tick: 0.05,
    contact: 0.0011,
  },
  /** A small block of wood: a knock more than a note. */
  wood: {
    wave: 'triangle',
    ring: 0.035,
    bright: 1.6,
    modes: [[2.31, 0.7, 0.022], [4.07, 0.35, 0.012]],
    tick: 0.35,
    contact: 0.0005,
  },
  /** A felt hammer: a soft, plain tone. */
  felt: { wave: 'sine', ring: 0.15, bright: 1.5, modes: [], tick: 0, contact: 0.001 },
} satisfies Record<string, Bar>

/** One cycle of each oscillator wave as WebAudio draws it (phase in cycles, 0..1). */
const WAVES: Record<OscillatorType, (p: number) => number> = {
  sine: (p) => Math.sin(2 * Math.PI * p),
  triangle: (p) => (p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4),
  sawtooth: (p) => (p < 0.5 ? 2 * p : 2 * p - 2),
  square: (p) => (p < 0.5 ? 1 : -1),
  custom: () => 0,
}

const STRIKE_ATTACK = 0.0003

/** The strike's samples (the wave under its brief envelope), exactly as the audio thread will compute them. */
function strikeSamples(wave: OscillatorType, freq: number, contact: number, rate: number): Float64Array {
  const samples = new Float64Array(Math.ceil((STRIKE_ATTACK + contact) * rate))
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate
    const env = t < STRIKE_ATTACK ? SILENT ** (1 - t / STRIKE_ATTACK) : SILENT ** ((t - STRIKE_ATTACK) / contact)
    samples[i] = WAVES[wave]((freq * t) % 1) * env
  }
  return samples
}

/** How much a strike gives a mode at `f`: its spectrum there (amplitude × seconds). */
function spectrumAt(samples: Float64Array, rate: number, f: number): number {
  let re = 0
  let im = 0
  for (let i = 0; i < samples.length; i++) {
    re += samples[i] * Math.cos((2 * Math.PI * f * i) / rate)
    im += samples[i] * Math.sin((2 * Math.PI * f * i) / rate)
  }
  return Math.hypot(re, im) / rate
}

/** The strike's click: its peak above `fc` (a one-pole high-pass, close enough). */
function clickPeak(samples: Float64Array, rate: number, fc: number): number {
  const k = 1 / (1 + (2 * Math.PI * fc) / rate)
  let y = 0
  let prev = 0
  let peak = 0
  for (let i = 0; i < samples.length + 8; i++) {
    const x = samples[i] ?? 0
    y = k * (y + x - prev)
    prev = x
    peak = Math.max(peak, Math.abs(y))
  }
  return peak
}

/**
 * A struck bar (modal synthesis): one oscillator is both the fundamental,
 * mellowing as it rings, and the mallet. A sub-millisecond slice of it (the
 * strike) excites a resonant band-pass per overtone, which then rings at
 * its own, inharmonic frequency and dies at its own rate, plus a soft click.
 * Each overtone's gain comes from what the strike gives it, so the timbre
 * holds up and down the scale. One source per note. Returns it.
 */
export function mallet(ac: Ctx, out: AudioNode, t0: number, freq: number, gain: number, bar: Bar, ring = bar.ring) {
  const rate = ac.sampleRate
  ring = vary(ring, 0.08)
  const src = oscillator(ac, bar.wave, freq, t0, t0 + ring + 0.05)
  const tone = filter(ac, 'lowpass', freq * bar.bright, -3)
  tone.frequency.setValueAtTime(freq * bar.bright, t0)
  tone.frequency.exponentialRampToValueAtTime(freq * 1.3, t0 + ring * 0.4)
  src.connect(tone).connect(envelope(ac, t0, gain, 0.0015, ring)).connect(out)

  const contact = vary(bar.contact, 0.15)
  const strike = contour(ac, t0, [[STRIKE_ATTACK, 1], [STRIKE_ATTACK + contact, SILENT]])
  // Fully shut after the strike, so the sustained tone never leaks into the resonators.
  strike.gain.setValueAtTime(0, t0 + STRIKE_ATTACK + contact)
  src.connect(strike)
  const samples = strikeSamples(bar.wave, freq, contact, rate)
  const reach = spectrumAt(samples, rate, freq)
  for (const [ratio, level, modeRing] of bar.modes) {
    const f = freq * vary(ratio, 0.006)
    const given = spectrumAt(samples, rate, f)
    // A mode out of the strike's reach (or near the top of hearing) stays silent.
    if (f > rate * 0.4 || !(given > reach * 0.01)) continue
    // A resonator with Q = π f τ rings for τ (s) with amplitude 2 × given / τ.
    const tau = vary(modeRing, 0.1) / 6.9
    strike
      .connect(filter(ac, 'bandpass', f, Math.PI * f * tau))
      .connect(amp(ac, (vary(level, 0.2) * gain * tau) / (2 * given)))
      .connect(out)
  }
  const fc = Math.min(3500, rate * 0.3)
  const peak = clickPeak(samples, rate, fc)
  if (bar.tick > 0 && peak > 0.01) {
    const click = amp(ac, (vary(bar.tick, 0.2) * gain) / peak)
    strike.connect(filter(ac, 'highpass', fc, -3)).connect(click).connect(out)
  }
  return src
}

// ---- The cat ----

export type MeowKind = 'mew' | 'chirp' | 'happy' | 'grumble' | 'sad'

/**
 * The mouth shapes a meow moves through: formants (F1, F2, F3 in Hz), and
 * how bright the voice gets (a low-pass, Hz), open mouths being brighter.
 */
const MOUTH = {
  /** Closed and nasal: the "m". */
  m: [350, 1200, 2600, 1600],
  /** Half open, rolling an "rr". */
  r: [520, 1350, 2700, 2400],
  /** Wide open: "ee". */
  e: [950, 2050, 3050, 5000],
  /** Wide open: "a". */
  a: [1000, 1700, 2900, 4500],
  /** Rounded: the "ow". */
  o: [620, 1000, 2650, 2200],
} as const
type Mouth = keyof typeof MOUTH

/** How narrow (Q) and how loud each formant is. */
const FORMANTS = [
  { q: 3, gain: 1 },
  { q: 6, gain: 0.6 },
  { q: 8, gain: 0.3 },
] as const

interface Call {
  /** Base pitch (Hz) and length (s). */
  f0: number
  dur: number
  /** Pitch over the call: [fraction of it, × f0]. Every call starts at f0. */
  pitch: Points
  /** Mouth shapes over the call: [fraction, shape]. */
  mouth: readonly (readonly [number, Mouth])[]
  /** Loudness over the call: [fraction, level]. */
  loud: Points
  /** Vibrato depth (± share of the pitch). */
  vibrato: number
  /** A rolled stretch: [from, to] (fractions of the call), flutter rate (Hz), depth. */
  trill?: readonly [number, number, number, number]
  /** Breath noise, relative to the voice. */
  breath: number
  /** A growl an octave below, relative to the voice. */
  growl?: number
}

/** A small cat's calls (F0 550-1000 Hz; a grumble sits lower). */
const CALLS: Record<MeowKind, Call> = {
  /** "Mew": short, up and down. */
  mew: {
    f0: 680,
    dur: 0.26,
    pitch: [[0, 1], [0.35, 1.22], [0.7, 1.1], [1, 0.88]],
    mouth: [[0, 'm'], [0.12, 'm'], [0.42, 'e'], [0.72, 'e'], [1, 'o']],
    loud: [[0, 0], [0.07, 0.3], [0.38, 1], [0.75, 0.7], [1, 0]],
    vibrato: 0.012,
    breath: 0.05,
  },
  /** "Brrp?": a quick rolled trill, going up. */
  chirp: {
    f0: 680,
    dur: 0.13,
    pitch: [[0, 1], [0.55, 1.3], [1, 1.42]],
    mouth: [[0, 'r'], [0.5, 'e'], [1, 'e']],
    loud: [[0, 0], [0.06, 0.6], [0.35, 1], [0.85, 0.75], [1, 0]],
    vibrato: 0,
    trill: [0, 0.65, 25, 0.55],
    breath: 0.07,
  },
  /** "Mrr-ow!": a rolled hello, then a happy rise. */
  happy: {
    f0: 640,
    dur: 0.48,
    pitch: [[0, 1], [0.32, 0.95], [0.42, 1], [0.7, 1.3], [1, 1.16]],
    mouth: [[0, 'm'], [0.3, 'r'], [0.44, 'o'], [0.72, 'e'], [1, 'o']],
    loud: [[0, 0], [0.05, 0.35], [0.3, 0.55], [0.4, 0.28], [0.68, 1], [1, 0]],
    vibrato: 0.015,
    trill: [0, 0.36, 24, 0.5],
    breath: 0.05,
  },
  /** "Mrrrw": low, falling and rough. */
  grumble: {
    f0: 400,
    dur: 0.4,
    pitch: [[0, 1], [0.3, 1.03], [1, 0.76]],
    mouth: [[0, 'm'], [0.3, 'r'], [0.7, 'o'], [1, 'm']],
    loud: [[0, 0], [0.08, 0.6], [0.3, 1], [0.8, 0.55], [1, 0]],
    vibrato: 0.006,
    trill: [0, 1, 31, 0.3],
    breath: 0.1,
    growl: 0.4,
  },
  /** "Meeoww...": long, sinking. */
  sad: {
    f0: 580,
    dur: 0.66,
    pitch: [[0, 1], [0.15, 1.1], [0.5, 0.97], [1, 0.72]],
    mouth: [[0, 'm'], [0.1, 'm'], [0.32, 'e'], [0.6, 'a'], [1, 'o']],
    loud: [[0, 0], [0.08, 0.35], [0.32, 1], [0.7, 0.6], [1, 0]],
    vibrato: 0.02,
    breath: 0.08,
  },
}

/** Pitch and loudness are drawn this finely (s). */
const DRAW_STEP = 0.005

/** Glides `param` through the mouth shapes of a call (`hz` reads a shape's frequency), a little different each time. */
function moveMouth(param: AudioParam, t0: number, dur: number, mouth: Call['mouth'], hz: (shape: Mouth) => number) {
  param.setValueAtTime(hz(mouth[0][1]), t0)
  for (const [x, shape] of mouth.slice(1)) param.exponentialRampToValueAtTime(vary(hz(shape), 0.03), t0 + x * dur)
}

/**
 * A meow, as a voice is made (source and filter): a buzzy glottal source
 * whose pitch follows the call's contour, with vibrato and jitter, through
 * three formants that glide as the mouth opens and rounds, plus breath.
 * The call starts exactly at `f0` and drifts from there. Returns the source.
 */
export function meow(ac: Ctx, out: AudioNode, t0: number, kind: MeowKind, f0 = vary(CALLS[kind].f0, 0.06), gain = 0.1) {
  const call = CALLS[kind]
  const dur = vary(call.dur, 0.08)
  const end = t0 + dur
  const src = oscillator(ac, 'sawtooth', f0, t0, end + 0.02)
  const growl = call.growl ? oscillator(ac, 'sawtooth', f0 / 2, t0, end + 0.02) : null

  const drift = vary(1, 0.06)
  const vibratoHz = rand(5, 6)
  const phase = rand(0, 2 * Math.PI)
  let jitter = 0
  for (let t = DRAW_STEP; t < dur + DRAW_STEP / 2; t += DRAW_STEP) {
    const x = t / dur
    jitter += (rand(-0.006, 0.006) - jitter) * 0.5
    const vibrato = call.vibrato * Math.sin(2 * Math.PI * vibratoHz * t + phase) * Math.min(1, t / 0.06)
    const f = f0 * interp(call.pitch, x) * (1 + (drift - 1) * Math.min(1, x * 4)) * (1 + vibrato + jitter)
    src.frequency.exponentialRampToValueAtTime(f, t0 + t)
    growl?.frequency.exponentialRampToValueAtTime(f / 2, t0 + t)
  }

  // The source's spectral tilt (brighter as the mouth opens), then the mouth: three formants in parallel.
  const voice = filter(ac, 'lowpass', 3500, -3)
  src.connect(voice)
  if (growl && call.growl) growl.connect(amp(ac, call.growl)).connect(voice)
  const level = ac.createGain()
  // A higher call comes from a smaller, tenser mouth: its formants rise with it (most of the way), so
  // the fundamental doesn't slip past F1 and a purr streak's mews keep their loudness.
  const size = vary(1, 0.05) * (f0 / CALLS[kind].f0) ** 0.7
  FORMANTS.forEach(({ q, gain: formantGain }, k) => {
    const band = filter(ac, 'bandpass', 1000, q)
    voice.connect(band).connect(amp(ac, formantGain)).connect(level)
    moveMouth(band.frequency, t0, dur, call.mouth, (shape) => MOUTH[shape][k] * size)
  })
  moveMouth(voice.frequency, t0, dur, call.mouth, (shape) => MOUTH[shape][3])
  // A little of the bare voice, so no harmonic vanishes between formants.
  voice.connect(amp(ac, 0.03)).connect(level)

  level.gain.setValueAtTime(SILENT, t0)
  for (let t = DRAW_STEP; t < dur; t += DRAW_STEP) {
    const x = t / dur
    let loud = interp(call.loud, x)
    if (call.trill && x >= call.trill[0] && x <= call.trill[1]) {
      const [from, , hz, depth] = call.trill
      loud *= 1 - depth * 0.5 * (1 - Math.cos(2 * Math.PI * hz * (t - from * dur)))
    }
    level.gain.exponentialRampToValueAtTime(Math.max(SILENT, loud * gain), t0 + t)
  }
  level.gain.exponentialRampToValueAtTime(SILENT, end)
  level.connect(out)

  const breath = noise(ac, textures(ac).white, t0, end)
  breath.connect(filter(ac, 'bandpass', vary(3000, 0.1), 0.9)).connect(amp(ac, call.breath)).connect(level)
  return src
}

/** A longer purr loops about this much of one (s). */
const PURR_LOOP = 8

/**
 * A purr: pulses at ~25 Hz, each a soft low thump with a puff of breath,
 * breathing out (longer, louder, lower) and in by turns, with a catch
 * between breaths. Drawn sample by sample: its rhythm is the whole point.
 * Past PURR_LOOP, it's drawn as whole pairs of breaths to loop, the seam
 * falling in a catch.
 */
function purrBuffer(ac: Ctx, seconds: number): { buffer: AudioBuffer; loop: boolean } {
  const rate = ac.sampleRate
  const loop = seconds > PURR_LOOP
  const breaths: { at: number; len: number; out: boolean }[] = []
  let t = rand(0, 0.04)
  for (let out = Math.random() < 0.75; t < Math.min(seconds, PURR_LOOP) || (loop && breaths.length % 2 === 1); out = !out) {
    const len = out ? rand(0.95, 1.15) : rand(0.8, 0.95)
    breaths.push({ at: t, len, out })
    t += len + rand(0.05, 0.11)
  }
  const length = Math.max(1, Math.round(rate * (loop ? t : seconds)))
  const buffer = ac.createBuffer(1, length, rate)
  const data = buffer.getChannelData(0)
  const k = 1 - Math.exp((-2 * Math.PI * 1400) / rate)
  // One pulse: the thump (drawn per breath, as its pitch changes) and the fade of its puff of breath.
  const pulse = Math.round(0.032 * rate)
  const thump = new Float32Array(pulse)
  const puff = Float32Array.from({ length: pulse }, (_, i) => 2.6 * Math.exp(-i / rate / 0.006))
  let haze = 0
  for (const { at: start, len, out } of breaths) {
    const hz = out ? rand(22.5, 24) : rand(25, 26.5)
    const body = out ? rand(58, 68) : rand(72, 84)
    const level = out ? 1 : rand(0.6, 0.72)
    for (let i = 0; i < pulse; i++) thump[i] = 0.45 * Math.sin((2 * Math.PI * body * i) / rate) * Math.exp(-i / rate / 0.011)
    for (let p = 0; p < len; p += 1 / vary(hz, 0.03)) {
      const a = level * Math.sin(Math.PI * (p / len)) ** 0.5 * rand(0.75, 1.05)
      const at = Math.round((start + p) * rate)
      for (let i = 0; i < pulse && at + i < length; i++) {
        haze += k * (Math.random() * 2 - 1 - haze)
        data[at + i] += a * (thump[i] + haze * puff[i])
      }
    }
  }
  let peak = 0
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(data[i]))
  for (let i = 0; i < length; i++) data[i] /= peak || 1
  return { buffer, loop }
}

/** A purr of `seconds`, with a soft start and end. Returns `stop(at)`, which fades it out over 250 ms. */
export function purr(ac: Ctx, out: AudioNode, t0: number, seconds: number, gain = 0.14): (at: number) => void {
  const end = t0 + seconds
  const src = ac.createBufferSource()
  const { buffer, loop } = purrBuffer(ac, seconds + 0.05)
  src.buffer = buffer
  src.loop = loop
  src.start(t0)
  src.stop(end + 0.05)
  const attack = Math.min(0.35, seconds * 0.3)
  const release = Math.min(0.45, seconds * 0.4)
  const level = ac.createGain()
  level.gain.setValueAtTime(0, t0)
  level.gain.linearRampToValueAtTime(gain, t0 + attack)
  level.gain.setValueAtTime(gain, end - release)
  level.gain.linearRampToValueAtTime(0, end)
  const fader = amp(ac, 1)
  src.connect(filter(ac, 'lowpass', vary(950, 0.1), -1)).connect(level)
  // The throat: the rumble a phone speaker can actually play.
  src.connect(filter(ac, 'bandpass', vary(320, 0.1), 1.4)).connect(amp(ac, 0.7)).connect(level)
  level.connect(fader).connect(out)
  let stopped = false
  return (at) => {
    if (stopped) return
    stopped = true
    fader.gain.setValueAtTime(1, at)
    fader.gain.exponentialRampToValueAtTime(SILENT, at + 0.25)
    src.stop(Math.min(at + 0.26, end + 0.05))
  }
}

/** A paw landing: a soft low thump and a muffled tap of the pad. */
export function pat(ac: Ctx, out: AudioNode, t0: number, gain = 0.08) {
  const f = vary(140, 0.08)
  const body = oscillator(ac, 'sine', f, t0, t0 + 0.08)
  body.frequency.exponentialRampToValueAtTime(f / 2, t0 + 0.06)
  body.connect(envelope(ac, t0, gain, 0.002, 0.06)).connect(out)
  const tap = noise(ac, textures(ac).white, t0, t0 + 0.035)
  tap.connect(filter(ac, 'lowpass', vary(900, 0.15), -3)).connect(envelope(ac, t0, gain * 0.9, 0.001, 0.025)).connect(out)
}

/** A mouse squeak: a thin whistle that jumps up and settles, fluttering. */
function squeak(ac: Ctx, out: AudioNode, t0: number, gain = 0.03) {
  const f = vary(2900, 0.06)
  const dur = rand(0.05, 0.07)
  const voice = oscillator(ac, 'sine', f, t0, t0 + dur + 0.01)
  const overtone = oscillator(ac, 'sine', f * 2, t0, t0 + dur + 0.01)
  for (let t = 0.004; t < dur; t += 0.004) {
    const glide =
      f *
      interp(
        [[0, 1], [0.3, 1.32], [1, 1.12]],
        t / dur,
      ) *
      (1 + 0.03 * Math.sin(2 * Math.PI * 38 * t))
    voice.frequency.exponentialRampToValueAtTime(glide, t0 + t)
    overtone.frequency.exponentialRampToValueAtTime(2 * glide, t0 + t)
  }
  const level = contour(ac, t0, [[0.005, gain], [dur * 0.7, gain * 0.8], [dur, SILENT]])
  voice.connect(level)
  overtone.connect(amp(ac, 0.15)).connect(level)
  level.connect(out)
}

// ---- Paper, crackers and knocks ----

/** A pencil stroke: graphite hiss through the paper's grain, and the faint knock of the desk under it. */
function stroke(ac: Ctx, out: AudioNode, t0: number, lift = 1, gain = 0.05): AudioBufferSourceNode {
  const dur = rand(0.045, 0.06)
  const end = t0 + dur
  const [src, evenly] = paperNoise(ac, t0, end + 0.005)
  gain *= evenly
  const centre = vary(3600 * lift, 0.08)
  const hiss = filter(ac, 'bandpass', centre * 0.8, 0.9)
  hiss.frequency.setValueAtTime(centre * 0.8, t0)
  hiss.frequency.exponentialRampToValueAtTime(centre * 1.2, end)
  const level = contour(ac, t0, [[rand(0.004, 0.008), gain], [dur * 0.65, gain * rand(0.6, 0.85)], [dur, SILENT]])
  src.connect(hiss).connect(level)
  src.connect(filter(ac, 'bandpass', vary(350, 0.15), 1)).connect(amp(ac, 0.15)).connect(level)
  level.connect(out)
  return src
}

/** An eraser rubbing: a softer, longer swipe whose hiss closes down as it lifts. */
function rub(ac: Ctx, out: AudioNode, t0: number, gain = 0.05) {
  const dur = rand(0.11, 0.15)
  const end = t0 + dur
  const [src, evenly] = paperNoise(ac, t0, end + 0.005)
  gain *= evenly
  const soft = filter(ac, 'lowpass', 2600, 1)
  soft.frequency.setValueAtTime(vary(2600, 0.1), t0)
  soft.frequency.exponentialRampToValueAtTime(vary(750, 0.1), end)
  const level = contour(ac, t0, [[0.02, gain], [dur * 0.55, gain * 0.8], [dur, SILENT]])
  src.connect(soft).connect(level)
  src.connect(filter(ac, 'bandpass', vary(1100, 0.1), 1.4)).connect(amp(ac, 0.6)).connect(level)
  level.connect(filter(ac, 'highpass', 250, -3)).connect(out)
}

/** A breath of air rising, a soft whistle under it: unsure, like a test cat. */
function puff(ac: Ctx, out: AudioNode, t0: number, gain = 0.1) {
  const air = noise(ac, textures(ac).white, t0, t0 + 0.2)
  const band = filter(ac, 'bandpass', 900, 2.5)
  band.frequency.setValueAtTime(vary(900, 0.08), t0)
  band.frequency.exponentialRampToValueAtTime(vary(2300, 0.08), t0 + 0.16)
  air
    .connect(band)
    .connect(
      contour(ac, t0, [[0.04, gain], [0.18, SILENT]]),
    )
    .connect(out)
  const f = vary(520, 0.04)
  const whistle = oscillator(ac, 'sine', f, t0, t0 + 0.2)
  whistle.frequency.exponentialRampToValueAtTime(f * 1.7, t0 + 0.14)
  whistle
    .connect(
      contour(ac, t0, [[0.03, gain * 0.35], [0.17, SILENT]]),
    )
    .connect(out)
}

/** A fish cracker snapping: a burst of crisp clicks, each its own splinter, all from one noise. */
export function crunch(ac: Ctx, out: AudioNode, t0: number, gain = 0.35) {
  const clicks = 4 + Math.floor(Math.random() * 4)
  const src = noise(ac, textures(ac).white, t0, t0 + 0.16)
  const crisp = filter(ac, 'bandpass', 3000, 1.1)
  const level = ac.createGain()
  level.gain.setValueAtTime(SILENT, t0)
  let t = t0
  for (let i = 0; i < clicks && t < t0 + 0.12; i++) {
    const gap = rand(0.008, 0.025)
    crisp.frequency.setValueAtTime(rand(1500, 5000), t)
    level.gain.setValueAtTime(SILENT, t)
    level.gain.exponentialRampToValueAtTime(gain * 0.85 ** i * rand(0.75, 1), t + 0.0007)
    level.gain.exponentialRampToValueAtTime(SILENT, t + Math.min(rand(0.005, 0.01), gap - 0.001))
    t += gap
  }
  src.connect(crisp).connect(level)
  // The cracker's body, under the crispness.
  src.connect(filter(ac, 'lowpass', 900, -3)).connect(amp(ac, 0.35)).connect(level)
  level.connect(out)
}

/** The heart cracking: a sharp split (one noise, splitting twice more) and a small falling "tink" (one tone). */
function crack(ac: Ctx, out: AudioNode, t0: number, gain = 0.12) {
  const snap = noise(ac, textures(ac).white, t0, t0 + 0.07)
  const level = ac.createGain()
  level.gain.setValueAtTime(SILENT, t0)
  let t = t0
  for (let i = 0; i < 3; i++) {
    level.gain.exponentialRampToValueAtTime(gain * (1 - 0.3 * i), t + 0.0006)
    const gap = rand(0.008, 0.014)
    level.gain.exponentialRampToValueAtTime(gain * 0.04, t + gap - 0.001)
    t += gap
  }
  level.gain.exponentialRampToValueAtTime(SILENT, t + 0.03)
  snap.connect(filter(ac, 'highpass', vary(2000, 0.1), -3)).connect(level).connect(out)
  const f = vary(1250, 0.05)
  const tink = oscillator(ac, 'triangle', f, t0, t0 + 0.12)
  tink.frequency.exponentialRampToValueAtTime(f * 0.4, t0 + 0.09)
  tink.connect(filter(ac, 'lowpass', 2500, -3)).connect(envelope(ac, t0, gain * 0.45, 0.001, 0.09)).connect(out)
}

/** A soft bump: a falling low note (a muffled triangle, so even a phone speaker carries it) with a dull knock. */
function thud(ac: Ctx, out: AudioNode, t0: number, gain = 0.14, f = vary(150, 0.06)) {
  const body = oscillator(ac, 'triangle', f, t0, t0 + 0.2)
  body.frequency.exponentialRampToValueAtTime(f * 0.4, t0 + 0.14)
  body.connect(filter(ac, 'lowpass', 600, -3)).connect(envelope(ac, t0, gain, 0.003, 0.17)).connect(out)
  const knock = noise(ac, textures(ac).white, t0, t0 + 0.06)
  knock.connect(filter(ac, 'lowpass', vary(420, 0.1), -3)).connect(envelope(ac, t0, gain * 0.7, 0.002, 0.045)).connect(out)
}

/** A drop of water: a bubble rings, its pitch rising as it fades ("bloop"), with a tiny tick as it breaks. */
function droplet(ac: Ctx, out: AudioNode, t0: number, f = vary(430, 0.06), gain = 0.065, dur = 0.09) {
  const ring = oscillator(ac, 'sine', f, t0, t0 + dur + 0.02)
  ring.frequency.exponentialRampToValueAtTime(f * 2.3, t0 + dur * 0.6)
  ring.connect(envelope(ac, t0, gain, 0.0015, dur)).connect(out)
  const tick = noise(ac, textures(ac).white, t0, t0 + 0.01)
  tick.connect(filter(ac, 'bandpass', 3500, 1)).connect(envelope(ac, t0, gain * 0.25, 0.0004, 0.004)).connect(out)
}

// ---- Every sound of the game, as a voice ----

/** C6 major pentatonic, up two octaves. */
const PENTATONIC = [1047, 1175, 1319, 1568, 1760, 2093, 2349, 2637, 3136, 3520]
/** A long wave plinks every other X (or fewer), so it never turns into a buzz. */
const MAX_PLINKS = 14

const NOTES = { E4: 329.6, G4: 392, A4: 440, C4: 261.6, E6: 1318.5, G6: 1568, B6: 1975.5, C7: 2093 }
/** The cat's usual voice. */
const MEW_HZ = 680

/** A tine rings shorter the higher it is. */
const tineRing = (freq: number, at1k: number) => at1k * (1047 / freq) ** 0.5

/** A cat's wave or a hint: a plink per X, climbing the pentatonic. */
function plinks(ac: Ctx, out: AudioNode, t0: number, delays: Map<number, number>, kind: 'cat' | 'test') {
  // X's drawn at once (calm mode) plink once.
  const times = [...new Set(delays.values())].sort((a, b) => a - b)
  const every = Math.ceil(times.length / MAX_PLINKS)
  const picked = times.filter((_, i) => i % every === 0)
  const top = Math.min(picked.length, PENTATONIC.length) - 1
  picked.forEach((delay, i) => {
    const freq = PENTATONIC[Math.round((i * top) / Math.max(1, picked.length - 1))]
    const t = t0 + delay / 1000
    if (kind === 'cat') mallet(ac, out, t, freq, 0.035, BARS.kalimba, tineRing(freq, 0.3))
    else mallet(ac, out, t, freq / 2, 0.03, BARS.felt)
  })
}

/** Win: a note per row of hopping cats; returns the first row's (its end cues the happy cat, live). */
function winRows(ac: Ctx, out: AudioNode, t0: number, rows: number, start: number, step: number) {
  const top = Math.min(rows, PENTATONIC.length) - 1
  let first: OscillatorNode | undefined
  for (let i = 0; i < rows; i++) {
    const freq = PENTATONIC[Math.round((i * top) / Math.max(1, rows - 1))] / 2
    const note = mallet(ac, out, t0 + (start + i * step) / 1000, freq, 0.06, BARS.marimba, i === rows - 1 ? 0.9 : 0.4)
    first ??= note
  }
  return first
}

/** The happy cat after a win: "mrr-ow!", then a short purr. */
function winCat(ac: Ctx, out: AudioNode, t0: number) {
  meow(ac, out, t0, 'happy', undefined, 0.1)
  purr(ac, out, t0 + 0.42, 1.5, 0.12)
}

/** When the happy cat meows: as the last row lands. */
const winCatAt = (rows: number, start: number, step: number) => (start + (rows - 1) * step) / 1000 + 0.22

/**
 * Every sound of the game as a pure voice (`ac`, `out`, start time `t0`,
 * then the sound's own arguments), so it can render offline as well.
 */
export const sounds = {
  /** Two pencil strokes, one per stroke of XMark (the second starts 120ms in). */
  x: (ac: Ctx, out: AudioNode, t0: number) => [stroke(ac, out, t0), stroke(ac, out, t0 + 0.12)] as const,
  /** One stroke per cell painted by a drag, rising a little with each one. */
  drag: (ac: Ctx, out: AudioNode, t0: number, n: number) => stroke(ac, out, t0, 1.04 ** Math.min(n, 12)),
  erase: (ac: Ctx, out: AudioNode, t0: number) => rub(ac, out, t0),
  ghost: (ac: Ctx, out: AudioNode, t0: number) => puff(ac, out, t0),
  /** A mew or a chirp, a whole tone higher per cat of a purr streak (up to 5 steps), and a pat as it lands. */
  cat: (ac: Ctx, out: AudioNode, t0: number, landMs: number, streak = 1) => {
    const steps = Math.min(Math.max(0, streak - 1), 5)
    const chirpy = 0.3 + 0.08 * steps
    meow(ac, out, t0, Math.random() < chirpy ? 'chirp' : 'mew', MEW_HZ * 2 ** ((2 * steps) / 12), 0.065)
    pat(ac, out, t0 + landMs / 1000)
  },
  ting: (ac: Ctx, out: AudioNode, t0: number) => {
    mallet(ac, out, t0, NOTES.E6, 0.042, BARS.glass, 0.5)
    mallet(ac, out, t0, NOTES.B6, 0.028, BARS.glass, 0.4)
  },
  wave: plinks,
  intro: (ac: Ctx, out: AudioNode, t0: number, diagonals: number, stepMs: number) => {
    for (let i = 0; i < diagonals; i++) {
      // One step late, so each plink lands as its diagonal pops into view.
      const freq = 700 * 3 ** (i / Math.max(1, diagonals - 1))
      mallet(ac, out, t0 + ((i + 1) * stepMs) / 1000, freq, 0.018, BARS.musicBox, 0.14)
    }
  },
  clear: (ac: Ctx, out: AudioNode, t0: number) => {
    mallet(ac, out, t0, NOTES.G6, 0.04, BARS.kalimba, 0.4)
    mallet(ac, out, t0 + 0.06, NOTES.C7, 0.036, BARS.kalimba, 0.5)
  },
  /** A soft bump and a grumble on the wrong cat; at 650ms the heart cracks and the fish snaps. */
  wrong: (ac: Ctx, out: AudioNode, t0: number) => {
    thud(ac, out, t0)
    meow(ac, out, t0 + 0.07, 'grumble', undefined, 0.09)
    crack(ac, out, t0 + 0.65)
    crunch(ac, out, t0 + rand(0.662, 0.69), 0.25)
  },
  contradiction: (ac: Ctx, out: AudioNode, t0: number) => {
    mallet(ac, out, t0, NOTES.G4, 0.055, BARS.marimba, 0.3)
    mallet(ac, out, t0 + 0.11, NOTES.E4, 0.055, BARS.marimba, 0.42)
  },
  refute: (ac: Ctx, out: AudioNode, t0: number) => {
    mallet(ac, out, t0, NOTES.A4, 0.045, BARS.marimba, 0.22)
    mallet(ac, out, t0 + 0.09, NOTES.E4, 0.045, BARS.marimba, 0.3)
  },
  /** "Cross out": a rubber stamp's thump, and a bright chime. */
  proof: (ac: Ctx, out: AudioNode, t0: number) => {
    thud(ac, out, t0, 0.13, vary(120, 0.05))
    mallet(ac, out, t0 + 0.04, 1320, 0.045, BARS.glass, 0.5)
  },
  /** A muted knock: the ink can't write there. */
  blocked: (ac: Ctx, out: AudioNode, t0: number) => mallet(ac, out, t0, vary(560, 0.04), 0.04, BARS.wood, 0.05),
  /** The bulb: a small glass bell. */
  hint: (ac: Ctx, out: AudioNode, t0: number) => {
    mallet(ac, out, t0, 1320, 0.05, BARS.glass, 1)
    mallet(ac, out, t0, 1980, 0.02, BARS.glass, 0.6)
  },
  /** The mouse: two little squeaks. */
  mouse: (ac: Ctx, out: AudioNode, t0: number) => [0, 0.085].forEach((at) => squeak(ac, out, t0 + at)),
  /** A soft wooden click, for chips, power-ups and buttons. */
  ui: (ac: Ctx, out: AudioNode, t0: number) => mallet(ac, out, t0, vary(1250, 0.06), 0.024, BARS.wood),
  /** Tick-tock, backwards. */
  undo: (ac: Ctx, out: AudioNode, t0: number) => {
    mallet(ac, out, t0, vary(1150, 0.03), 0.038, BARS.wood)
    mallet(ac, out, t0 + 0.05, vary(820, 0.03), 0.038, BARS.wood)
  },
  /** Each row of cats hops on its own note (an octave down, warm and round), then the cat meows and purrs. */
  win: (ac: Ctx, out: AudioNode, t0: number, rows: number, start: number, step: number) => {
    winRows(ac, out, t0, rows, start, step)
    winCat(ac, out, t0 + winCatAt(rows, start, step))
  },
  /** A fish popping back into the pill. */
  bloop: (ac: Ctx, out: AudioNode, t0: number) => droplet(ac, out, t0),
  /** A reward chip popping onto the result card: a pop, a bubble and a glint. */
  pop: (ac: Ctx, out: AudioNode, t0: number) => {
    const burst = noise(ac, textures(ac).white, t0, t0 + 0.03)
    burst.connect(filter(ac, 'bandpass', vary(1400, 0.1), 1.4)).connect(envelope(ac, t0, 0.09, 0.0008, 0.014)).connect(out)
    droplet(ac, out, t0, vary(650, 0.05), 0.06, 0.05)
    mallet(ac, out, t0 + 0.01, 2637, 0.012, BARS.glass, 0.25)
  },
  /** Gently sad: four notes falling, then a sad little meow. */
  lose: (ac: Ctx, out: AudioNode, t0: number) => {
    const falling = [NOTES.A4, NOTES.G4, NOTES.E4, NOTES.C4]
    falling.forEach((f, i) => mallet(ac, out, t0 + i * 0.16, f, 0.07, BARS.marimba, i === 3 ? 0.8 : 0.5))
    meow(ac, out, t0 + 0.64, 'sad', undefined, 0.09)
  },
  star: (ac: Ctx, out: AudioNode, t0: number, i: number) => {
    const f = [NOTES.E6, NOTES.G6, NOTES.C7][i] ?? NOTES.C7
    mallet(ac, out, t0, f, 0.05, BARS.glass, 0.7)
    mallet(ac, out, t0 + 0.012, f * 2, 0.012, BARS.glass, 0.25)
  },
  meow: (ac: Ctx, out: AudioNode, t0: number, kind: MeowKind = 'mew') => void meow(ac, out, t0, kind),
  purr: (ac: Ctx, out: AudioNode, t0: number, seconds: number) => purr(ac, out, t0, seconds),
  pat: (ac: Ctx, out: AudioNode, t0: number) => pat(ac, out, t0),
  crunch: (ac: Ctx, out: AudioNode, t0: number) => crunch(ac, out, t0),
}

/** Runs a voice on the live context, `delay` ms from now (nothing with sound off). */
function play<T>(delay: number, voice: (ac: Ctx, out: AudioNode, t0: number) => T): T | undefined {
  const g = audioGraph()
  return g ? voice(g.ctx, g.sfxBus, g.ctx.currentTime + delay / 1000) : undefined
}

/** XMark's second stroke, while it's still to come (a double-tap can take it back). */
let secondStroke: AudioScheduledSourceNode | null = null

export const sfx = {
  /**
   * Creates or wakes the audio context; call it from a user gesture
   * (browsers only start sound after one).
   */
  unlock: () => void audioGraph(),
  /** Two pencil strokes, one per stroke of XMark (the second starts 120ms in). */
  x: () => {
    secondStroke = play(0, sounds.x)?.[1] ?? null
  },
  /**
   * The X became a cat before its second stroke: that stroke is never
   * drawn, so it isn't heard either (a stop before the start silences it).
   */
  lift: () => {
    if (graph) secondStroke?.stop(graph.ctx.currentTime)
    secondStroke = null
  },
  /** One stroke per cell painted by a drag, rising a little with each one. */
  drag: (n: number) => void play(0, (ac, out, t0) => sounds.drag(ac, out, t0, n)),
  /** A soft rubber swipe: a mark wiped away. */
  erase: () => void play(0, sounds.erase),
  /** An airy, unsure breath for a test cat. */
  ghost: () => void play(0, sounds.ghost),
  /**
   * A mew (or a chirp), and a soft pat as the cat lands (`landMs` after it
   * appears). Each cat of a purr streak mews a whole tone higher, up to 5 steps.
   */
  cat: (landMs: number, streak = 1) => void play(0, (ac, out, t0) => sounds.cat(ac, out, t0, landMs, streak)),
  /** A bright glass "ting" as the first sparkle reaches the points counter. */
  ting: (delay = 0) => void play(delay, sounds.ting),
  /**
   * A kalimba plink for each X of a cat's wave, as it draws, climbing the
   * pentatonic. Test cats plink an octave lower and softer, on a plain felt
   * sine, so a guess never sounds like success.
   */
  wave: (delays: Map<number, number>, kind: 'cat' | 'test') =>
    void play(0, (ac, out, t0) => sounds.wave(ac, out, t0, delays, kind)),
  /** The board builds itself: a very quiet music-box plink per diagonal, rising like a zip. */
  intro: (diagonals: number, stepMs: number) => void play(0, (ac, out, t0) => sounds.intro(ac, out, t0, diagonals, stepMs)),
  clear: (delay = 0) => void play(delay, sounds.clear),
  /** A soft bump and a grumble on the wrong cat, then the heart cracks and the fish snaps (650ms in). */
  wrong: () => void play(0, sounds.wrong),
  /** A test ink just ran into a wall: a soft wooden "uh-oh", in time with the red outline. */
  contradiction: (delay = 0) => void play(delay, sounds.contradiction),
  /** The pen overruled a test cat. */
  refute: (delay = 0) => void play(delay, sounds.refute),
  /** "Cross out": a stamp thump and a bright chime. */
  proof: () => void play(0, sounds.proof),
  /** A test ink can't write over the pen. */
  blocked: () => void play(0, sounds.blocked),
  /** The bulb: a small glass bell. */
  hint: () => void play(0, sounds.hint),
  /** The mouse: two little squeaks. */
  mouse: () => void play(0, sounds.mouse),
  /** A soft wooden click for ink chips, power-ups and overlay buttons. */
  ui: () => void play(0, sounds.ui),
  undo: () => void play(0, sounds.undo),
  /**
   * Win: each row of cats hops (row `i` takes off at `start + i * step` ms)
   * on its own note, climbing the pentatonic an octave down, warm and round;
   * as the last row lands the cat meows happily and purrs. That tail is
   * queued once the first row's note has rung (its `ended`), still placed
   * on the audio clock, so the notes go out first and alone.
   */
  win: (rows: number, start: number, step: number) => {
    const g = audioGraph()
    if (!g) return
    const t0 = g.ctx.currentTime
    const first = winRows(g.ctx, g.sfxBus, t0, rows, start, step)
    if (!first) return
    first.onended = () => {
      const live = audioGraph()
      if (live) winCat(live.ctx, live.sfxBus, Math.max(live.ctx.currentTime + 0.02, t0 + winCatAt(rows, start, step)))
    }
  },
  /** A fish popping back into the pill ("Get 3 fish"): a water drop. */
  bloop: (delay = 0) => void play(delay, sounds.bloop),
  /** A reward chip popping onto the result card. */
  pop: (delay = 0) => void play(delay, sounds.pop),
  lose: () => void play(0, sounds.lose),
  star: (i: number) => void play(0, (ac, out, t0) => sounds.star(ac, out, t0, i)),
  /** The cat speaks: 'mew', 'chirp' (a rolled "brrp?"), 'happy' ("mrr-ow!"), 'grumble' or 'sad'. */
  meow: (kind: MeowKind = 'mew', delay = 0) => void play(delay, (ac, out, t0) => sounds.meow(ac, out, t0, kind)),
  /** A purr of `seconds`; returns a stop function that fades it out over ~250ms. */
  purr: (seconds: number, delay = 0): (() => void) => {
    const g = audioGraph()
    if (!g) return () => {}
    const stop = purr(g.ctx, g.sfxBus, g.ctx.currentTime + delay / 1000, seconds)
    return () => stop(g.ctx.currentTime)
  },
  /** A soft paw landing. */
  pat: (delay = 0) => void play(delay, sounds.pat),
  /** A fish cracker snapping. */
  crunch: (delay = 0) => void play(delay, sounds.crunch),
}

export function haptic(pattern: number | number[]) {
  if (progress.settings.vibrate && typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern)
}
