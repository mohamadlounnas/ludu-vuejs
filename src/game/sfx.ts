import { progress } from './progress'

/**
 * Tiny synthesized sound kit (WebAudio, no files) and haptics. Every sound
 * respects the sound setting; haptics respect the vibration setting.
 */
let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (!progress.settings.sound || typeof AudioContext === 'undefined') return null
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
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
  if (!ac) return
  const t0 = ac.currentTime + delay / 1000
  const osc = ac.createOscillator()
  const amp = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur / 1000)
  amp.gain.setValueAtTime(0.0001, t0)
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012)
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur / 1000)
  let node: AudioNode = osc
  if (filter) {
    const lp = ac.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(filter[0], t0)
    lp.frequency.exponentialRampToValueAtTime(filter[1], t0 + dur / 1000)
    osc.connect(lp)
    node = lp
  }
  node.connect(amp).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + dur / 1000 + 0.02)
}

const NOTES = { C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, E6: 1318.5, G6: 1568, C7: 2093 }

export const sfx = {
  /** Pen tick when an X goes down. */
  x: () => tone({ freq: 1250, to: 820, type: 'triangle', dur: 45, gain: 0.05 }),
  erase: () => tone({ freq: 700, to: 480, type: 'triangle', dur: 40, gain: 0.04 }),
  /** Soft airy blip for a test cat. */
  ghost: () => tone({ freq: 520, to: 880, dur: 140, gain: 0.05 }),
  /** Happy "mew" plus a rising arpeggio. */
  cat: () => {
    tone({ freq: 620, to: 980, type: 'sawtooth', dur: 120, gain: 0.05, filter: [2600, 1400] })
    tone({ freq: 980, to: 760, type: 'sawtooth', dur: 160, gain: 0.04, delay: 110, filter: [1800, 900] })
    ;[NOTES.C6, NOTES.E6, NOTES.G6].forEach((f, i) => tone({ freq: f, dur: 160, gain: 0.05, delay: 60 + i * 70 }))
  },
  clear: (delay = 0) => {
    tone({ freq: NOTES.G6, dur: 120, gain: 0.04, delay })
    tone({ freq: NOTES.C7, dur: 160, gain: 0.035, delay: delay + 60 })
  },
  wrong: () => {
    tone({ freq: 220, to: 90, type: 'square', dur: 220, gain: 0.05 })
    tone({ freq: 140, to: 70, type: 'triangle', dur: 260, gain: 0.08, delay: 30 })
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
  hint: () => [NOTES.E6, NOTES.G6].forEach((f, i) => tone({ freq: f, dur: 120, gain: 0.04, delay: i * 80 })),
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
