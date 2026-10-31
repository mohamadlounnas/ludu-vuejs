import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

/** A param that records its automation. */
const param = (value = 0) => ({
  value,
  setValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  cancelScheduledValues: vi.fn(),
})

/** A stand-in AudioContext that records what each sound would start, and when. */
class FakeAudio {
  static made = 0
  static last: FakeAudio
  currentTime = 10
  state = 'running'
  sampleRate = 8000
  destination = {}
  starts: { kind: 'tone' | 'noise'; at: number; freq?: number; type?: string; stoppedAt?: number }[] = []
  filters: { type: string; frequency: ReturnType<typeof param> }[] = []
  constructor() {
    FakeAudio.made++
    FakeAudio.last = this
  }
  private node = () => ({ connect: <T>(next: T) => next, disconnect: vi.fn() })
  createGain = () => ({ ...this.node(), gain: param(1) })
  createBiquadFilter = () => {
    const filter = { ...this.node(), type: '', Q: param(), frequency: param() }
    this.filters.push(filter)
    return filter
  }
  createDynamicsCompressor = () => ({ ...this.node(), ...Object.fromEntries(['threshold', 'knee', 'ratio', 'attack', 'release'].map((k) => [k, param()])) })
  createBuffer = (_channels: number, length: number) => {
    const data = new Float32Array(length)
    return { length, getChannelData: () => data }
  }
  createOscillator = () => {
    const frequency = param()
    const osc = {
      ...this.node(),
      type: 'sine',
      frequency,
      start: (at: number) => this.starts.push({ kind: 'tone', at, freq: frequency.setValueAtTime.mock.calls[0]?.[0], type: osc.type }),
      stop: vi.fn(),
    }
    return osc
  }
  sources: { buffer: { length: number } | null; loop?: boolean }[] = []
  createBufferSource = () => {
    const start = { kind: 'noise' as const, at: 0, stoppedAt: undefined as number | undefined }
    const source = {
      ...this.node(),
      buffer: null,
      start: (at: number) => this.starts.push(Object.assign(start, { at })),
      stop: (at: number) => (start.stoppedAt = at),
    }
    this.sources.push(source)
    return source
  }
  resume = vi.fn()
  suspend = vi.fn()
}

/** Fresh sound, music and progress modules (they keep their context), with the fake installed. */
const fresh = async (sound = true) => {
  vi.resetModules()
  vi.stubGlobal('AudioContext', FakeAudio)
  FakeAudio.made = 0
  const { progress } = await import('./progress')
  progress.settings.sound = sound
  progress.settings.music = true
  const { sfx, sounds } = await import('./sfx')
  const { music } = await import('./music')
  return { sfx, sounds, music, progress }
}
const since = (at: number) => Math.round((at - FakeAudio.last.currentTime) * 1000)

afterEach(() => vi.unstubAllGlobals())

describe('the cat', () => {
  it('meows from its source: a buzzy voice (a growl too, for a grumble) and a breath, all at once', async () => {
    const { sfx } = await fresh()
    for (const kind of ['mew', 'chirp', 'happy', 'grumble', 'sad'] as const) {
      sfx.unlock()
      FakeAudio.last.starts = []
      sfx.meow(kind, 300)
      const [voice, ...rest] = FakeAudio.last.starts
      expect(voice).toMatchObject({ kind: 'tone', type: 'sawtooth' })
      expect(FakeAudio.last.starts.every((s) => since(s.at) === 300)).toBe(true)
      expect(rest.filter((s) => s.kind === 'noise')).toHaveLength(1)
      const growl = rest.filter((s) => s.kind === 'tone')
      if (kind === 'grumble') expect(growl.map((s) => s.freq)).toEqual([voice.freq! / 2])
      else expect(growl).toHaveLength(0)
    }
  })

  it('pats as a cat lands: a low thump and a muffled tap', async () => {
    const { sfx } = await fresh()
    sfx.cat(213, 1)
    const pat = FakeAudio.last.starts.filter((s) => since(s.at) === 213)
    expect(pat.map((s) => s.kind).sort()).toEqual(['noise', 'tone'])
    const thump = pat.find((s) => s.kind === 'tone')!
    expect(thump.freq).toBeGreaterThan(125)
    expect(thump.freq).toBeLessThan(155)
  })

  it('purrs until stopped, then fades out over 250ms (a second stop changes nothing)', async () => {
    const { sfx } = await fresh()
    const stop = sfx.purr(3, 100)
    const [purr] = FakeAudio.last.starts
    expect(since(purr.at)).toBe(100)
    expect(since(purr.stoppedAt!)).toBe(3150)
    FakeAudio.last.currentTime = 11
    stop()
    expect(purr.stoppedAt).toBeCloseTo(11.26)
    FakeAudio.last.currentTime = 12
    stop()
    expect(purr.stoppedAt).toBeCloseTo(11.26)
  })

  it('loops a long purr from a few seconds of whole breaths, rather than drawing it all', async () => {
    const { sfx } = await fresh()
    sfx.purr(60)
    const [source] = FakeAudio.last.sources
    expect(source.loop).toBe(true)
    expect(source.buffer!.length).toBeLessThan(11 * FakeAudio.last.sampleRate)
    expect(since(FakeAudio.last.starts[0].stoppedAt!)).toBe(60050)
    sfx.purr(2)
    expect(FakeAudio.last.sources[1].loop).toBe(false)
  })

  it('stays silent with sound off, and a purr still hands back a stop', async () => {
    const { sfx } = await fresh(false)
    sfx.meow('happy')
    sfx.pat()
    sfx.crunch()
    expect(() => sfx.purr(2)()).not.toThrow()
    expect(FakeAudio.made).toBe(0)
  })
})

describe('crunch', () => {
  it('snaps a fish cracker: 4 to 7 crisp clicks from one noise, within ~120ms', async () => {
    const { sfx } = await fresh()
    for (let i = 0; i < 20; i++) {
      sfx.unlock()
      FakeAudio.last.starts = []
      FakeAudio.last.filters = []
      sfx.crunch(40)
      expect(FakeAudio.last.starts.map((s) => [s.kind, since(s.at)])).toEqual([['noise', 40]])
      // Each click is its own splinter: the band-pass jumps to a new place for it.
      const crisp = FakeAudio.last.filters.find((f) => f.type === 'bandpass')!
      const clicks = crisp.frequency.setValueAtTime.mock.calls.map(([hz, at]) => ({ hz, ms: since(at) - 40 }))
      expect(clicks.length).toBeGreaterThanOrEqual(4)
      expect(clicks.length).toBeLessThanOrEqual(7)
      for (const c of clicks) {
        expect(c.hz).toBeGreaterThanOrEqual(1500)
        expect(c.hz).toBeLessThanOrEqual(5000)
        expect(c.ms).toBeLessThanOrEqual(120)
      }
    }
  })

  it('a wrong cat: the fish snaps just after the heart cracks', async () => {
    const { sfx } = await fresh()
    sfx.wrong()
    const late = FakeAudio.last.starts.filter((s) => since(s.at) > 650)
    expect(late).toHaveLength(1)
    expect(late[0].kind).toBe('noise')
    expect(since(late[0].at)).toBeGreaterThanOrEqual(660)
    expect(since(late[0].at)).toBeLessThanOrEqual(690)
  })
})

describe('voices', () => {
  it('play on whatever context they are given (so they render offline), never the live one', async () => {
    const { sounds } = await fresh()
    const offline = new FakeAudio()
    FakeAudio.made = 0
    const out = offline.destination as AudioNode
    const ac = offline as unknown as BaseAudioContext
    sounds.wrong(ac, out, 0)
    sounds.win(ac, out, 0, 7, 600, 90)
    sounds.lose(ac, out, 0)
    sounds.cat(ac, out, 0, 213, 3)
    sounds.purr(ac, out, 0, 2)
    expect(FakeAudio.made).toBe(0)
    // Offline, the win's happy meow and purr follow its notes directly.
    expect(offline.starts.length).toBeGreaterThan(20)
  })
})

describe('music', () => {
  /** A window that keeps the music's timer and listeners, to drive them by hand. */
  const fakeWindow = () => {
    const listeners = new Map<string, () => void>()
    const win = {
      tick: null as (() => void) | null,
      setInterval: vi.fn((fn: () => void) => ((win.tick = fn), 1)),
      clearInterval: vi.fn(() => (win.tick = null)),
      setTimeout: vi.fn(),
      addEventListener: vi.fn((type: string, fn: () => void) => listeners.set(type, fn)),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
      gesture: () => listeners.get('pointerup')?.(),
      active: (detail: boolean) => (listeners.get('catgrid:active') as ((event: { detail: boolean }) => void) | undefined)?.({ detail }),
    }
    vi.stubGlobal('window', win)
    return win
  }

  it('is safe to import and call without a browser', async () => {
    const { music } = await fresh()
    expect(() => (music.attach(), music.start(), music.stop())).not.toThrow()
  })

  it('schedules notes a little ahead on the audio clock, and stops cleanly', async () => {
    const win = fakeWindow()
    const { music } = await fresh()
    music.start()
    const ctx = FakeAudio.last
    const first = ctx.starts.length
    expect(first).toBeGreaterThan(0)
    // Nothing further ahead than the look-ahead.
    expect(Math.max(...ctx.starts.map((s) => since(s.at)))).toBeLessThanOrEqual(400)
    const pump = win.tick!
    const play = (seconds: number) => {
      for (let t = 0; t < seconds; t += 0.05) {
        ctx.currentTime += 0.05
        const now = ctx.currentTime
        const before = ctx.starts.length
        pump()
        for (const s of ctx.starts.slice(before)) {
          expect(s.at).toBeGreaterThanOrEqual(now - 1e-9)
          expect(s.at).toBeLessThanOrEqual(now + 0.3 + 1e-9)
        }
      }
    }
    play(6)
    expect(ctx.starts.length).toBeGreaterThan(first)
    music.stop()
    expect(win.clearInterval).toHaveBeenCalled()
    const stopped = ctx.starts.length
    play(6)
    expect(ctx.starts.length).toBe(stopped)
  })

  it('stops music on native backgrounding and resumes only if music is enabled', async () => {
    const win = fakeWindow()
    const { music, progress } = await fresh()
    music.attach()
    win.gesture()
    win.active(false)
    expect(win.clearInterval).toHaveBeenCalledTimes(1)
    progress.settings.music = false
    await nextTick()
    win.active(true)
    expect(win.setInterval).toHaveBeenCalledTimes(1)
    progress.settings.music = true
    await nextTick()
    expect(win.setInterval).toHaveBeenCalledTimes(2)
  })

  it('waits for a gesture, then follows the sound and music settings', async () => {
    const win = fakeWindow()
    const { music, progress } = await fresh()
    music.attach()
    expect(win.setInterval).not.toHaveBeenCalled()
    win.gesture()
    expect(win.setInterval).toHaveBeenCalledTimes(1)
    progress.settings.music = false
    await nextTick()
    expect(win.clearInterval).toHaveBeenCalledTimes(1)
    progress.settings.music = true
    await nextTick()
    expect(win.setInterval).toHaveBeenCalledTimes(2)
    progress.settings.sound = false
    await nextTick()
    expect(win.clearInterval).toHaveBeenCalledTimes(2)
  })
})
