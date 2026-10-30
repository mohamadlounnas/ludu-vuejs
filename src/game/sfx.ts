import { progress } from './progress'

/**
 * Tiny synthesized sound kit (WebAudio, no files) and haptics. Every sound
 * respects the sound setting; haptics respect the vibration setting.
 *
 * Sounds follow the picture: each one is scheduled on the audio clock at
 * the moment its animation shows it (`delay` ms from now), never with
 * timers, so a wave of X's plinks exactly as its X's draw.
 */
let ctx: AudioContext | null = null
/** Every sound goes through one gain and a gentle compressor, so stacked sounds never clip. */
let master: GainNode | null = null
/** One second of white noise, shared by every noise burst. */
let noiseBuffer: AudioBuffer | null = null

const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'

function audio(): AudioContext | null {
  if (!progress.settings.sound || typeof AudioContext === 'undefined') return null
  if (!ctx) {
    ctx = new AudioContext()
    const squash = ctx.createDynamicsCompressor()
    squash.threshold.value = -18
    squash.knee.value = 12
    squash.ratio.value = 4
    squash.attack.value = 0.003
    squash.release.value = 0.2
    master = ctx.createGain()
    master.gain.value = 0.55
    master.connect(squash).connect(ctx.destination)
  }
  if (ctx.state !== 'running' && !hidden()) void ctx.resume()
  return ctx
}

// The page in the background is silent; it picks up where it was when it comes back.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return
    if (hidden()) void ctx.suspend()
    else void ctx.resume()
  })
}

/** A quick attack, then an exponential fade to silence at `end`. */
function envelope(ac: AudioContext, t0: number, end: number, gain: number, attack = 0.012): GainNode {
  const amp = ac.createGain()
  amp.gain.setValueAtTime(0.0001, t0)
  amp.gain.exponentialRampToValueAtTime(gain, t0 + attack)
  amp.gain.exponentialRampToValueAtTime(0.0001, end)
  return amp
}

interface Tone {
  freq: number
  to?: number
  type?: OscillatorType
  dur: number
  gain?: number
  delay?: number
  /** Optional low-pass sweep (Hz), used for the "mew". */
  filter?: [from: number, to: number]
}

function tone({ freq, to, type = 'sine', dur, gain = 0.08, delay = 0, filter }: Tone) {
  const ac = audio()
  if (!ac || !master) return
  const t0 = ac.currentTime + delay / 1000
  const end = t0 + dur / 1000
  const osc = ac.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, end)
  let node: AudioNode = osc
  if (filter) {
    const lp = ac.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(filter[0], t0)
    lp.frequency.exponentialRampToValueAtTime(filter[1], end)
    osc.connect(lp)
    node = lp
  }
  node.connect(envelope(ac, t0, end, gain)).connect(master)
  osc.start(t0)
  osc.stop(end + 0.02)
}

interface Noise {
  type: 'bandpass' | 'lowpass' | 'highpass'
  /** Filter frequency (Hz), swept to `to` if given. */
  from: number
  to?: number
  dur: number
  gain?: number
  delay?: number
  q?: number
}

/** Filtered white noise: pen scratches, swishes and cracks. */
function noise({ type, from, to, dur, gain = 0.1, delay = 0, q = 1 }: Noise): AudioScheduledSourceNode | null {
  const ac = audio()
  if (!ac || !master) return null
  if (!noiseBuffer) {
    noiseBuffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  const t0 = ac.currentTime + delay / 1000
  const end = t0 + dur / 1000
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer
  const filter = ac.createBiquadFilter()
  filter.type = type
  filter.Q.value = q
  filter.frequency.setValueAtTime(from, t0)
  if (to) filter.frequency.exponentialRampToValueAtTime(to, end)
  src.connect(filter).connect(envelope(ac, t0, end, gain, 0.004)).connect(master)
  // From a random spot in the buffer, so no two bursts sound alike.
  src.start(t0, Math.random() * 0.9)
  src.stop(end + 0.02)
  return src
}

/** One pen stroke; `n` raises it a little per cell of a drag. */
const scratch = (n = 0, delay = 0) => {
  const lift = 1.04 ** Math.min(n, 12)
  return noise({ type: 'bandpass', from: 2400 * lift, to: 3800 * lift, dur: 45, gain: 0.1, q: 1.2, delay })
}

/** XMark's second stroke, while it's still to come (a double-tap can take it back). */
let secondStroke: AudioScheduledSourceNode | null = null

/** C6 major pentatonic, up two octaves. */
const PENTATONIC = [1047, 1175, 1319, 1568, 1760, 2093, 2349, 2637, 3136, 3520]
/** A long wave plinks every other X (or fewer), so it never turns into a buzz. */
const MAX_PLINKS = 14

const NOTES = { C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, E6: 1318.5, G6: 1568, C7: 2093 }

export const sfx = {
  /**
   * Creates or wakes the audio context; call it from a user gesture
   * (browsers only start sound after one).
   */
  unlock: () => void audio(),
  /** Two pen scratches, one per stroke of XMark (the second starts 120ms in). */
  x: () => {
    scratch()
    secondStroke = scratch(0, 120)
  },
  /**
   * The X became a cat before its second stroke: that stroke is never
   * drawn, so it isn't heard either (a stop before the start silences it).
   */
  lift: () => {
    if (ctx) secondStroke?.stop(ctx.currentTime)
    secondStroke = null
  },
  /** One scratch per cell painted by a drag, rising a little with each one. */
  drag: (n: number) => void scratch(n),
  /** A quick "fwip": a mark wiped away. */
  erase: () => void noise({ type: 'lowpass', from: 1200, to: 400, dur: 60, gain: 0.16 }),
  /** Soft airy blip for a test cat. */
  ghost: () => tone({ freq: 520, to: 880, dur: 140, gain: 0.05 }),
  /** Happy "mew", and a soft pat as the cat lands (`landMs` after it appears). */
  cat: (landMs: number) => {
    tone({ freq: 620, to: 980, type: 'sawtooth', dur: 120, gain: 0.05, filter: [2600, 1400] })
    tone({ freq: 980, to: 760, type: 'sawtooth', dur: 160, gain: 0.04, delay: 110, filter: [1800, 900] })
    tone({ freq: 320, to: 150, type: 'triangle', dur: 70, gain: 0.09, delay: landMs })
  },
  /**
   * A plink for each X of a cat's wave, as it draws, climbing the
   * pentatonic. Test cats plink an octave lower and softer, on a plain sine,
   * so a guess never sounds like success.
   */
  wave: (delays: Map<number, number>, kind: 'cat' | 'test') => {
    const times = [...delays.values()].sort((a, b) => a - b)
    const every = Math.ceil(times.length / MAX_PLINKS)
    const plinks = times.filter((_, i) => i % every === 0)
    const top = Math.min(plinks.length, PENTATONIC.length) - 1
    plinks.forEach((delay, i) => {
      const freq = PENTATONIC[Math.round((i * top) / Math.max(1, plinks.length - 1))]
      if (kind === 'cat') tone({ freq, type: 'triangle', dur: 90, gain: 0.04, delay })
      else tone({ freq: freq / 2, dur: 90, gain: 0.025, delay })
    })
  },
  /** The board builds itself: a very quiet plink per diagonal, rising like a zip. */
  intro: (diagonals: number, stepMs: number) => {
    for (let i = 0; i < diagonals; i++) {
      // One step late, so each plink lands as its diagonal pops into view.
      const freq = 700 * 3 ** (i / Math.max(1, diagonals - 1))
      tone({ freq, type: 'triangle', dur: 60, gain: 0.03, delay: (i + 1) * stepMs })
    }
  },
  clear: (delay = 0) => {
    tone({ freq: NOTES.G6, dur: 120, gain: 0.04, delay })
    tone({ freq: NOTES.C7, dur: 160, gain: 0.035, delay: delay + 60 })
  },
  /** A bonk on the wrong cat, then a crack as the broken heart splits (650ms in). */
  wrong: () => {
    tone({ freq: 220, to: 90, type: 'square', dur: 220, gain: 0.05 })
    tone({ freq: 140, to: 70, type: 'triangle', dur: 260, gain: 0.08, delay: 30 })
    noise({ type: 'highpass', from: 1800, dur: 30, gain: 0.14, delay: 650 })
    tone({ freq: 900, to: 300, dur: 80, gain: 0.06, delay: 650 })
  },
  /** A test ink just ran into a wall: a short falling "uh-oh", in time with the red outline. */
  contradiction: (delay = 0) => {
    tone({ freq: 392, type: 'triangle', dur: 110, gain: 0.06, delay })
    tone({ freq: 330, type: 'triangle', dur: 110, gain: 0.06, delay: delay + 110 })
  },
  /** The pen overruled a test cat. */
  refute: (delay = 0) => {
    tone({ freq: 440, type: 'triangle', dur: 90, gain: 0.05, delay })
    tone({ freq: 330, type: 'triangle', dur: 90, gain: 0.05, delay: delay + 90 })
  },
  /** "Cross out": a stamp thump and a bright chime. */
  proof: () => {
    tone({ freq: 90, dur: 60, gain: 0.16 })
    tone({ freq: 1320, dur: 120, gain: 0.04, delay: 40 })
  },
  /** A test ink can't write over the pen. */
  blocked: () => tone({ freq: 900, type: 'triangle', dur: 25, gain: 0.04 }),
  /** The bulb: a small two-partial bell. */
  hint: () => {
    tone({ freq: 1320, dur: 400, gain: 0.05 })
    tone({ freq: 1980, dur: 400, gain: 0.025 })
  },
  /** The mouse: two little squeaks. */
  mouse: () => [0, 80].forEach((delay) => tone({ freq: 2200, to: 3200, dur: 60, gain: 0.04, delay })),
  /** Tick for ink chips, power-ups and overlay buttons. */
  ui: () => tone({ freq: 900, type: 'triangle', dur: 25, gain: 0.04 }),
  undo: () => tone({ freq: 900, to: 600, type: 'triangle', dur: 70, gain: 0.04 }),
  win: () => {
    ;[NOTES.C5, NOTES.E5, NOTES.G5, NOTES.C6, NOTES.E6, NOTES.G6].forEach((f, i) =>
      tone({ freq: f, type: 'triangle', dur: 260, gain: 0.06, delay: i * 90 }),
    )
    tone({ freq: NOTES.C6, dur: 700, gain: 0.05, delay: 560 })
  },
  lose: () => [440, 392, 330, 262].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 260, gain: 0.06, delay: i * 160 })),
  star: (i: number) => tone({ freq: [NOTES.E6, NOTES.G6, NOTES.C7][i] ?? NOTES.C7, dur: 180, gain: 0.05 }),
}

export function haptic(pattern: number | number[]) {
  if (progress.settings.vibrate && typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern)
}
