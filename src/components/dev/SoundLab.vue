<script setup lang="ts">
/**
 * Dev-only sound bench (`?soundlab`): every sound with a play button, and
 * for review scripts `window.__renderSound(name)`, which renders one
 * offline (44.1 kHz stereo, through the game's own room and compressor)
 * and resolves to a base64 16-bit WAV. `window.__soundNames` lists them.
 */
import { onMounted, ref } from 'vue'
import { music, renderMusic } from '../../game/music'
import { progress } from '../../game/progress'
import { masterChain, sfx, sounds, type Buses } from '../../game/sfx'

type Voice = (ac: BaseAudioContext, out: AudioNode, t0: number) => unknown
interface Entry {
  name: string
  /** Render length (s). */
  seconds: number
  play: () => void
  render: (ac: BaseAudioContext, buses: Buses, t0: number) => void
}

/** A wave of `n` X's, `stepMs` apart. */
const wave = (n: number, stepMs: number) => new Map(Array.from({ length: n }, (_, i) => [i, i * stepMs]))
const fx =
  (voice: Voice) =>
  (ac: BaseAudioContext, { sfxBus }: Buses, t0: number) =>
    void voice(ac, sfxBus, t0)
const sound = (name: string, seconds: number, play: () => void, voice: Voice): Entry => ({
  name,
  seconds,
  play,
  render: fx(voice),
})

/** The result card's score counting up: a tick every 60ms. */
const TICKS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

const ENTRIES: Entry[] = [
  sound('x', 0.7, sfx.x, sounds.x),
  sound('drag', 0.6, () => sfx.drag(4), (ac, out, t) => sounds.drag(ac, out, t, 4)),
  sound('erase', 0.7, sfx.erase, sounds.erase),
  sound('ghost', 0.8, sfx.ghost, sounds.ghost),
  sound('cat', 1.2, () => sfx.cat(213, 1), (ac, out, t) => sounds.cat(ac, out, t, 213, 1)),
  sound('cat-streak5', 1.2, () => sfx.cat(213, 5), (ac, out, t) => sounds.cat(ac, out, t, 213, 5)),
  sound('ting', 1.2, () => sfx.ting(), sounds.ting),
  sound('wave-cat', 2, () => sfx.wave(wave(12, 70), 'cat'), (ac, out, t) => sounds.wave(ac, out, t, wave(12, 70), 'cat')),
  sound('wave-test', 1.5, () => sfx.wave(wave(12, 40), 'test'), (ac, out, t) => sounds.wave(ac, out, t, wave(12, 40), 'test')),
  sound('intro', 1.5, () => sfx.intro(21, 28), (ac, out, t) => sounds.intro(ac, out, t, 21, 28)),
  sound('clear', 1.2, () => sfx.clear(), sounds.clear),
  sound('wrong', 1.6, sfx.wrong, sounds.wrong),
  sound('contradiction', 1.2, () => sfx.contradiction(), sounds.contradiction),
  sound('refute', 1, () => sfx.refute(), sounds.refute),
  sound('proof', 1.2, sfx.proof, sounds.proof),
  sound('blocked', 0.5, sfx.blocked, sounds.blocked),
  sound('hint', 1.8, sfx.hint, sounds.hint),
  sound('mouse', 0.8, sfx.mouse, sounds.mouse),
  sound('ui', 0.5, sfx.ui, sounds.ui),
  {
    name: 'ui-countup',
    seconds: 1.4,
    play: () => TICKS.forEach((i) => window.setTimeout(sfx.ui, i * 60)),
    render: fx((ac, out, t) => TICKS.forEach((i) => sounds.ui(ac, out, t + i * 0.06))),
  },
  sound('undo', 0.6, sfx.undo, sounds.undo),
  {
    // Everything a real cat placement plays at once (the loudest stack in the game).
    name: 'placement',
    seconds: 2.2,
    play: () => {
      sfx.wave(wave(14, 70), 'cat')
      sfx.cat(213, 3)
      sfx.ting(500)
      sfx.clear(700)
    },
    render: fx((ac, out, t) => {
      sounds.wave(ac, out, t, wave(14, 70), 'cat')
      sounds.cat(ac, out, t, 213, 3)
      sounds.ting(ac, out, t + 0.5)
      sounds.clear(ac, out, t + 0.7)
    }),
  },
  sound('win', 4.2, () => sfx.win(7, 600, 90), (ac, out, t) => sounds.win(ac, out, t, 7, 600, 90)),
  sound('bloop', 0.6, () => sfx.bloop(), sounds.bloop),
  sound('pop', 0.7, () => sfx.pop(), sounds.pop),
  sound('lose', 2.2, sfx.lose, sounds.lose),
  sound('star0', 1.2, () => sfx.star(0), (ac, out, t) => sounds.star(ac, out, t, 0)),
  sound('star2', 1.2, () => sfx.star(2), (ac, out, t) => sounds.star(ac, out, t, 2)),
  ...(['mew', 'chirp', 'happy', 'grumble', 'sad'] as const).map((kind) =>
    sound(`meow-${kind}`, 1.2, () => sfx.meow(kind), (ac, out, t) => sounds.meow(ac, out, t, kind)),
  ),
  sound('purr', 3.6, () => sfx.purr(3), (ac, out, t) => sounds.purr(ac, out, t, 3)),
  {
    name: 'purr-stopped',
    seconds: 2.4,
    play: () => {
      const stop = sfx.purr(4)
      window.setTimeout(stop, 1600)
    },
    render: fx((ac, out, t) => sounds.purr(ac, out, t, 4)(t + 1.6)),
  },
  sound('pat', 0.5, () => sfx.pat(), sounds.pat),
  sound('crunch', 0.6, () => sfx.crunch(), sounds.crunch),
  {
    name: 'music',
    seconds: 20,
    play: () => {
      if (playing.value) music.stop()
      else music.start()
      playing.value = !playing.value
    },
    render: (ac, { musicBus }, t) => renderMusic(ac, musicBus, t, 20),
  },
]

const playing = ref(false)

const RATE = 44100
/**
 * The compressor eases its makeup gain in over a fresh context's first
 * ~0.3 s (the live one is long past that): sounds start after this lead-in,
 * which is then cut, all but the last 20 ms.
 */
const LEAD = 0.3

async function render(name: string): Promise<string> {
  const entry = ENTRIES.find((e) => e.name === name)
  if (!entry) throw new Error(`No sound "${name}"`)
  const ac = new OfflineAudioContext(2, Math.ceil(RATE * (LEAD + entry.seconds)), RATE)
  entry.render(ac, masterChain(ac), LEAD)
  return wav(await ac.startRendering(), Math.round(RATE * (LEAD - 0.02)))
}

/** A 16-bit PCM WAV file of `buffer` from sample `from` on, base64-encoded. */
function wav(buffer: AudioBuffer, from = 0): string {
  const channels = buffer.numberOfChannels
  const length = buffer.length - from
  const size = length * channels * 2
  const bytes = new Uint8Array(44 + size)
  const view = new DataView(bytes.buffer)
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + size, true)
  text(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * channels * 2, true)
  view.setUint16(32, channels * 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, size, true)
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c))
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < channels; c++) {
      view.setInt16(44 + (i * channels + c) * 2, Math.round(Math.max(-1, Math.min(1, data[c][from + i])) * 32767), true)
    }
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

onMounted(() => {
  Object.assign(window, { __renderSound: render, __soundNames: ENTRIES.map((e) => e.name) })
})
</script>

<template>
  <div class="lab" dir="ltr">
    <h1>Sound lab</h1>
    <label class="switch">
      <input v-model="progress.settings.sound" type="checkbox" />
      Sound on
    </label>
    <section>
      <button v-for="e in ENTRIES" :key="e.name" :class="{ on: e.name === 'music' && playing }" @click="e.play()">
        {{ e.name }}
      </button>
    </section>
  </div>
</template>

<style scoped>
.lab {
  padding: 16px;
  font-family: system-ui, sans-serif;
}

h1 {
  margin: 0 0 8px;
  font-size: 20px;
}

.switch {
  display: block;
  margin-bottom: 12px;
  font-size: 14px;
}

section {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

button {
  padding: 10px 14px;
  border: 0;
  border-radius: 10px;
  background: #f5efed;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

button.on {
  background: #6cc070;
  color: #fff;
}
</style>
