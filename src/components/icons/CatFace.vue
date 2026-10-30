<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'

/**
 * Chubby tuxedo cat head, drawn to read like the original's 3D renders:
 * shaded fur with fluffy cheek tufts, a white mask over the lower face,
 * glossy eyes with real lids, blush, a pink nose and fine curved whiskers.
 *
 * Moods: `happy` (default), `wink` (cheeky, mouth open), `worried`, `sad`
 * (teary), `joy` (eyes squeezed shut, big smile).
 * `look` (-1..1 on each axis) points the irises, e.g. at the player's finger;
 * the pupils widen while the cat watches something.
 * Unless `still`, each cat lives on its own random schedule: blinks (now and
 * then a double or a slow, contented blink), glances around, ear flicks,
 * head tilts, sniffs, and once in a while a yawn. Bumping `pet` makes it
 * squeeze its eyes and lean into the touch.
 */
const props = withDefaults(
  defineProps<{
    mood?: 'happy' | 'wink' | 'worried' | 'sad' | 'joy'
    look?: { x: number; y: number }
    still?: boolean
    /** Increment to pet the cat. */
    pet?: number
  }>(),
  { mood: 'happy', look: () => ({ x: 0, y: 0 }), still: false, pet: 0 },
)

const id = useId()
const url = (name: string) => `url(#${id}-${name})`
const root = ref<SVGSVGElement | null>(null)

// ---- Behaviour state ----

const saccade = ref({ x: 0, y: 0.15 })
const tilt = ref(0)
const ears = ref({ l: 0, r: 0 })
const sniffing = ref(false)
const yawning = ref(false)
const petting = ref(false)

const tracking = computed(() => Math.hypot(props.look.x, props.look.y) > 0.25)
const gaze = computed(() => (tracking.value ? props.look : saccade.value))
const face = computed(() => (yawning.value ? 'yawn' : petting.value ? 'joy' : props.mood))
const openEyes = computed(() =>
  face.value === 'happy' || face.value === 'worried' || face.value === 'sad' ? [37, 83] : face.value === 'wink' ? [83] : [],
)
const eyeR = computed(() => (face.value === 'worried' ? 13.2 : 12.6))
const irisR = computed(() => (face.value === 'worried' ? 7.2 : face.value === 'sad' ? 9 : 9.6))
/** Wide pupils while watching something; small ones when worried. */
const pupil = computed(() => (face.value === 'worried' ? 0.72 : tracking.value ? 1.2 : 1))
const irisShift = computed(() => `translate(${gaze.value.x * 2.7}px, ${gaze.value.y * 2.3}px)`)
const blush = computed(() => (face.value === 'joy' || face.value === 'wink' ? 0.75 : 0.42))
const breath = `${(3 + Math.random() * 1.2).toFixed(2)}s`

const FIBRES = Array.from({ length: 12 }, (_, i) => (i * Math.PI * 2) / 12 + 0.13)

// ---- Behaviour scheduler: each cat on its own random clock ----

const timers = new Set<number>()
const later = (fn: () => void, ms: number) => {
  const t = window.setTimeout(() => {
    timers.delete(t)
    fn()
  }, ms)
  timers.add(t)
}
const rand = (min: number, max: number) => min + Math.random() * (max - min)

/** Lids close from top and bottom to a slit and open again (SMIL, so it reads as lids, not a squash). */
function blink(kind: 'blink' | 'slow' = 'blink') {
  root.value?.querySelectorAll<SVGAnimationElement>(`animate.${kind}`).forEach((a) => {
    if (typeof a.beginElement === 'function') a.beginElement()
  })
}

function glance() {
  const angle = rand(0, Math.PI * 2)
  const reach = rand(0.5, 1)
  saccade.value = { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach * 0.8 }
  later(() => {
    // Sometimes a second look somewhere else before settling.
    if (Math.random() < 0.3) glance()
    else saccade.value = { x: 0, y: 0.15 }
  }, rand(700, 2000))
}

function flick() {
  const side = Math.random()
  const l = side < 0.45 || side > 0.85
  const r = side >= 0.45
  ears.value = { l: l ? -16 : 0, r: r ? 16 : 0 }
  later(() => (ears.value = { l: l ? 5 : 0, r: r ? -5 : 0 }), 110)
  later(() => (ears.value = { l: 0, r: 0 }), 260)
}

function tiltHead(deg = rand(5, 8) * (Math.random() < 0.5 ? -1 : 1), hold = rand(1100, 1900)) {
  tilt.value = deg
  later(() => (tilt.value = 0), hold)
}

function sniff() {
  sniffing.value = true
  later(() => (sniffing.value = false), 650)
}

function yawn() {
  yawning.value = true
  ears.value = { l: -9, r: 9 }
  later(() => {
    yawning.value = false
    ears.value = { l: 0, r: 0 }
    later(() => blink(), 180)
  }, 1700)
}

function idle() {
  if (props.still) return
  const roll = Math.random()
  if (roll < 0.48) {
    blink()
    if (Math.random() < 0.22) later(() => blink(), 280)
  } else if (roll < 0.64) {
    if (!tracking.value) glance()
    else blink()
  } else if (roll < 0.77) flick()
  else if (roll < 0.85) tiltHead()
  else if (roll < 0.92) sniff()
  else if (roll < 0.97) blink('slow')
  else if (face.value === 'happy') yawn()
  else blink()
  later(idle, rand(1800, 5600))
}

function wake() {
  if (props.still) return
  // A fresh cat settles in with a blink, then lives on its own clock.
  later(() => blink(), rand(550, 900))
  later(idle, rand(1500, 4500))
}

function sleep() {
  timers.forEach(clearTimeout)
  timers.clear()
  saccade.value = { x: 0, y: 0.15 }
  tilt.value = 0
  ears.value = { l: 0, r: 0 }
  sniffing.value = false
  yawning.value = false
}

onMounted(wake)
onBeforeUnmount(sleep)
watch(
  () => props.still,
  (still) => (still ? sleep() : wake()),
)

// Petting: eyes squeeze shut, the head leans into the hand, then a slow blink.
let petTimer = 0
watch(
  () => props.pet,
  () => {
    clearTimeout(petTimer)
    yawning.value = false
    petting.value = true
    tilt.value = rand(5, 9) * (Math.random() < 0.5 ? -1 : 1)
    ears.value = { l: -6, r: 6 }
    petTimer = window.setTimeout(() => {
      petting.value = false
      tilt.value = 0
      ears.value = { l: 0, r: 0 }
      window.setTimeout(() => blink('slow'), 120)
    }, 1400)
  },
)
onBeforeUnmount(() => clearTimeout(petTimer))

/** For the dev gallery and review scripts: trigger a behaviour on demand. */
defineExpose({ blink, glance, flick, tiltHead, sniff, yawn })
</script>

<template>
  <svg ref="root" viewBox="0 0 120 112" aria-hidden="true" :class="['cat-face', face, { idle: !still, sniffing }]">
    <defs>
      <radialGradient :id="`${id}-fur`" cx="0.38" cy="0.22" r="0.85">
        <stop offset="0" stop-color="#5a5a65" />
        <stop offset="0.45" stop-color="#2a2a31" />
        <stop offset="1" stop-color="#0f0f13" />
      </radialGradient>
      <radialGradient :id="`${id}-mask`" cx="0.5" cy="0.3" r="0.78">
        <stop offset="0.45" stop-color="#ffffff" />
        <stop offset="0.82" stop-color="#efedf3" />
        <stop offset="1" stop-color="#d3cfdb" />
      </radialGradient>
      <linearGradient :id="`${id}-ear`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#6e3c48" />
        <stop offset="1" stop-color="#d38f9e" />
      </linearGradient>
      <radialGradient :id="`${id}-eye`" cx="0.45" cy="0.62" r="0.7">
        <stop offset="0.55" stop-color="#ffffff" />
        <stop offset="1" stop-color="#d5d7e3" />
      </radialGradient>
      <radialGradient :id="`${id}-iris`" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0.45" stop-color="#7a4a22" />
        <stop offset="0.7" stop-color="#a87443" />
        <stop offset="0.9" stop-color="#5b3519" />
        <stop offset="1" stop-color="#26150a" />
      </radialGradient>
      <radialGradient :id="`${id}-sheen`">
        <stop offset="0" stop-color="#fff" stop-opacity="0.24" />
        <stop offset="1" stop-color="#fff" stop-opacity="0" />
      </radialGradient>
      <!-- soft shading that gives the white muzzle its volume -->
      <radialGradient :id="`${id}-shade`">
        <stop offset="0" stop-color="#9c93a8" stop-opacity="0.32" />
        <stop offset="1" stop-color="#9c93a8" stop-opacity="0" />
      </radialGradient>
      <radialGradient :id="`${id}-pad`">
        <stop offset="0.35" stop-color="#fff" />
        <stop offset="1" stop-color="#fff" stop-opacity="0" />
      </radialGradient>
      <linearGradient :id="`${id}-nose`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffbccb" />
        <stop offset="1" stop-color="#e06a80" />
      </linearGradient>
      <!-- Each eye's opening: an ellipse whose lids meet in a slit to blink. -->
      <clipPath v-for="cx in openEyes" :id="`${id}-open-${cx}`" :key="cx">
        <ellipse :cx="cx" cy="64" :rx="eyeR" :ry="eyeR">
          <animate class="blink" attributeName="ry" :values="`${eyeR};0.4;${eyeR}`" keyTimes="0;0.42;1" dur="0.22s" begin="indefinite" calcMode="spline" keySplines="0.5 0 0.9 0.5;0.2 0.5 0.4 1" />
          <animate class="blink" attributeName="cy" values="64;66.8;64" keyTimes="0;0.42;1" dur="0.22s" begin="indefinite" calcMode="spline" keySplines="0.5 0 0.9 0.5;0.2 0.5 0.4 1" />
          <animate class="slow" attributeName="ry" :values="`${eyeR};3.4;3.4;${eyeR}`" keyTimes="0;0.3;0.72;1" dur="1.6s" begin="indefinite" calcMode="spline" keySplines="0.45 0 0.55 1;0 0 1 1;0.45 0 0.55 1" />
          <animate class="slow" attributeName="cy" values="64;66;66;64" keyTimes="0;0.3;0.72;1" dur="1.6s" begin="indefinite" calcMode="spline" keySplines="0.45 0 0.55 1;0 0 1 1;0.45 0 0.55 1" />
        </ellipse>
      </clipPath>
    </defs>

    <!-- soft contact shadow -->
    <ellipse cx="60" cy="108" rx="36" ry="3.5" fill="#000" opacity="0.16" />

    <g class="tilt" :style="{ transform: `rotate(${tilt}deg)` }">
      <g class="body" :style="{ '--breath': breath }">
        <!-- ears (behind the head), each flicking on its own -->
        <g class="ear left" :style="{ transform: `rotate(${ears.l}deg)` }">
          <path d="M10 62 C6 42 8 22 17 10 C20 6 25 6 29 10 L50 34 Z" :fill="url('fur')" stroke="#0f0f13" stroke-width="2" stroke-linejoin="round" />
          <path d="M17 50 C15 36 17 24 22 16 L42 35 Z" :fill="url('ear')" />
          <path d="M27 38 Q24 29 22.5 21 M31 36 Q29.5 29 28.5 23.5 M23 41 Q20 34 19.5 28" fill="none" stroke="#fbe6ec" stroke-width="0.9" stroke-linecap="round" opacity="0.75" />
        </g>
        <g class="ear right" :style="{ transform: `rotate(${ears.r}deg)` }">
          <path d="M110 62 C114 42 112 22 103 10 C100 6 95 6 91 10 L70 34 Z" :fill="url('fur')" stroke="#0f0f13" stroke-width="2" stroke-linejoin="round" />
          <path d="M103 50 C105 36 103 24 98 16 L78 35 Z" :fill="url('ear')" />
          <path d="M93 38 Q96 29 97.5 21 M89 36 Q90.5 29 91.5 23.5 M97 41 Q100 34 100.5 28" fill="none" stroke="#fbe6ec" stroke-width="0.9" stroke-linecap="round" opacity="0.75" />
        </g>

        <!-- head with fluffy cheek tufts -->
        <path d="M6 71 L0.5 74.5 L6 77.5 L1.2 82 L7.8 83.2 Z M114 71 L119.5 74.5 L114 77.5 L118.8 82 L112.2 83.2 Z" :fill="url('fur')" />
        <path
          d="M60 30 C92 30 112 44 115 64 C118 84 106 99 88 104 C79 106.5 70 107 60 107 C50 107 41 106.5 32 104 C14 99 2 84 5 64 C8 44 28 30 60 30 Z"
          :fill="url('fur')"
        />
        <path d="M55.5 31 L57.8 26.6 L59.6 30.4 L62 26.9 L64 31" :fill="url('fur')" />
        <ellipse cx="52" cy="42" rx="31" ry="11" :fill="url('sheen')" />
        <!-- a few lighter strands on the forehead -->
        <path d="M40 40 Q42 35 46 33.5 M47 38.5 Q48.5 34.5 51.5 33 M73 38.5 Q71.5 34.5 68.5 33 M80 40 Q78 35 74 33.5" fill="none" stroke="#fff" stroke-width="0.8" stroke-linecap="round" opacity="0.13" />

        <!-- white mask: blaze, muzzle, chin, with tufts where white meets black -->
        <path
          d="M60 40 C57 48 55 54 51 59 C44 63 30 61 19 68 L12.5 67 L16.5 72 L9.5 75 L14.5 79 C12 92 20 101 32 104 C42 107 52 107 55.5 107.6 L58 109.6 L60 107.8 L62 109.6 L64.5 107.6 C68 107 78 107 88 104 C100 101 108 92 105.5 79 L110.5 75 L103.5 72 L107.5 67 L101 68 C90 61 76 63 69 59 C65 54 63 48 60 40 Z"
          :fill="url('mask')"
        />

        <!-- muzzle volume: shade under the whisker pads and the chin, pads catching the light -->
        <ellipse cx="52" cy="91.5" rx="11" ry="5.5" :fill="url('shade')" />
        <ellipse cx="68" cy="91.5" rx="11" ry="5.5" :fill="url('shade')" />
        <ellipse cx="60" cy="99.5" rx="13" ry="4.5" :fill="url('shade')" />
        <ellipse cx="52.6" cy="86.6" rx="8.4" ry="5.6" :fill="url('pad')" />
        <ellipse cx="67.4" cy="86.6" rx="8.4" ry="5.6" :fill="url('pad')" />

        <!-- cheeks -->
        <ellipse cx="25" cy="84" rx="8" ry="4.2" fill="#f7a2b6" :opacity="blush" />
        <ellipse cx="95" cy="84" rx="8" ry="4.2" fill="#f7a2b6" :opacity="blush" />

        <!-- brows for worried / sad -->
        <path v-if="face === 'worried' || face === 'sad'" d="M25 50 L43 45 M95 50 L77 45" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.9" />

        <!-- open eyes: dark rim, glossy ball behind lids, iris that looks around -->
        <g v-for="cx in openEyes" :key="cx" class="eye">
          <ellipse :cx="cx" cy="64" :rx="eyeR + 2" :ry="eyeR + 2" fill="#141418">
            <animate class="blink" attributeName="ry" :values="`${eyeR + 2};2.2;${eyeR + 2}`" keyTimes="0;0.42;1" dur="0.22s" begin="indefinite" calcMode="spline" keySplines="0.5 0 0.9 0.5;0.2 0.5 0.4 1" />
            <animate class="blink" attributeName="cy" values="64;66.8;64" keyTimes="0;0.42;1" dur="0.22s" begin="indefinite" calcMode="spline" keySplines="0.5 0 0.9 0.5;0.2 0.5 0.4 1" />
            <animate class="slow" attributeName="ry" :values="`${eyeR + 2};5.2;5.2;${eyeR + 2}`" keyTimes="0;0.3;0.72;1" dur="1.6s" begin="indefinite" calcMode="spline" keySplines="0.45 0 0.55 1;0 0 1 1;0.45 0 0.55 1" />
            <animate class="slow" attributeName="cy" values="64;66;66;64" keyTimes="0;0.3;0.72;1" dur="1.6s" begin="indefinite" calcMode="spline" keySplines="0.45 0 0.55 1;0 0 1 1;0.45 0 0.55 1" />
          </ellipse>
          <g :clip-path="url(`open-${cx}`)">
            <circle :cx="cx" cy="64" :r="eyeR" :fill="url('eye')" />
            <g class="iris" :style="{ transform: irisShift }">
              <circle :cx="cx" :cy="face === 'worried' ? 63 : 65" :r="irisR" :fill="url('iris')" />
              <!-- fibres and a darker limbal ring give the iris depth -->
              <g stroke="#2a1608" stroke-width="0.55" opacity="0.28">
                <line
                  v-for="(a, i) in FIBRES"
                  :key="i"
                  :x1="cx + Math.cos(a) * irisR * 0.58"
                  :y1="(face === 'worried' ? 63 : 65) + Math.sin(a) * irisR * 0.58"
                  :x2="cx + Math.cos(a) * irisR * 0.92"
                  :y2="(face === 'worried' ? 63 : 65) + Math.sin(a) * irisR * 0.92"
                />
              </g>
              <circle :cx="cx" :cy="face === 'worried' ? 63 : 65" :r="irisR - 0.5" fill="none" stroke="#1d0f06" stroke-width="1.1" opacity="0.75" />
              <circle class="pupil" :cx="cx" :cy="face === 'worried' ? 63 : 65" :r="irisR * 0.52" fill="#0a0a0d" :style="{ transform: `scale(${pupil})` }" />
            </g>
            <!-- the lid's shadow on the top of the eyeball -->
            <ellipse :cx="cx" :cy="64 - eyeR * 0.72" :rx="eyeR * 1.05" :ry="eyeR * 0.5" fill="#1b1424" opacity="0.2" />
            <!-- reflections stay put while the iris moves under them -->
            <ellipse :cx="cx - 3.8" cy="59.8" rx="3.7" ry="2.7" fill="#fff" opacity="0.95" :transform="`rotate(-28 ${cx - 3.8} 59.8)`" />
            <circle :cx="cx + 4.2" cy="68.6" r="1.35" fill="#fff" opacity="0.85" />
          </g>
          <!-- wet lower lid when sad -->
          <path v-if="face === 'sad'" :d="`M${cx - 9} 71 Q${cx} 77 ${cx + 9} 71`" fill="none" stroke="#9fd8f7" stroke-width="2.2" stroke-linecap="round" />
        </g>

        <!-- wink: the left eye shut -->
        <g v-if="face === 'wink'">
          <path d="M26 66 Q37 57 48 66" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" />
          <path d="M26 66 Q37 57 48 66" fill="none" stroke="#141418" stroke-width="3.4" stroke-linecap="round" />
        </g>

        <!-- joy: both eyes squeezed into happy arcs; yawn: squeezed flat -->
        <g v-if="face === 'joy' || face === 'yawn'">
          <path
            v-for="cx in [37, 83]"
            :key="cx"
            :d="face === 'joy' ? `M${cx - 11} 67 Q${cx} 56 ${cx + 11} 67` : `M${cx - 11} 64 Q${cx} 60.5 ${cx + 11} 64`"
            fill="none"
            stroke="#fff"
            stroke-width="6"
            stroke-linecap="round"
          />
          <path
            v-for="cx in [37, 83]"
            :key="`i${cx}`"
            :d="face === 'joy' ? `M${cx - 11} 67 Q${cx} 56 ${cx + 11} 67` : `M${cx - 11} 64 Q${cx} 60.5 ${cx + 11} 64`"
            fill="none"
            stroke="#141418"
            stroke-width="3.4"
            stroke-linecap="round"
          />
        </g>

        <!-- whisker pads -->
        <g fill="#b9b2bd" opacity="0.6">
          <circle cx="47" cy="84" r="0.75" /><circle cx="44.6" cy="86.6" r="0.75" /><circle cx="47.6" cy="88.2" r="0.75" />
          <circle cx="73" cy="84" r="0.75" /><circle cx="75.4" cy="86.6" r="0.75" /><circle cx="72.4" cy="88.2" r="0.75" />
        </g>

        <!-- nose: soft rounded triangle with nostrils and a shine -->
        <g class="nose">
          <path d="M53.6 75.6 Q60 72.2 66.4 75.6 Q64.8 80.5 60.7 82.5 Q60 82.9 59.3 82.5 Q55.2 80.5 53.6 75.6 Z" :fill="url('nose')" />
          <path d="M56.6 78.6 Q57.6 79.8 58.6 79.4 M63.4 78.6 Q62.4 79.8 61.4 79.4" fill="none" stroke="#a8435a" stroke-width="0.8" stroke-linecap="round" opacity="0.55" />
          <ellipse cx="58.2" cy="76.3" rx="2" ry="0.95" fill="#fff" opacity="0.75" />
        </g>

        <!-- mouth -->
        <path v-if="face === 'happy'" d="M60 82.6 V85.2 M52.5 85.2 Q56.2 89.8 60 85.2 Q63.8 89.8 67.5 85.2" fill="none" stroke="#3d2c30" stroke-width="1.7" stroke-linecap="round" />
        <g v-else-if="face === 'wink' || face === 'joy'">
          <path d="M49 85 Q60 101 71 85 Q60 89 49 85 Z" fill="#6e2632" stroke="#3d2c30" stroke-width="1.4" stroke-linejoin="round" />
          <ellipse cx="60" cy="93.2" rx="5.4" ry="3.4" fill="#f27a8f" />
        </g>
        <g v-else-if="face === 'yawn'" class="yawn-mouth">
          <path d="M47.5 86 Q60 110 72.5 86 Q60 80.5 47.5 86 Z" fill="#5e1f2a" stroke="#3d2c30" stroke-width="1.4" stroke-linejoin="round" />
          <ellipse cx="60" cy="99.5" rx="6.6" ry="4.4" fill="#f27a8f" />
          <path d="M50.6 86.6 L52.6 90.6 L54 86 Z M69.4 86.6 L67.4 90.6 L66 86 Z" fill="#fff" />
        </g>
        <ellipse v-else-if="face === 'worried'" cx="60" cy="89" rx="3.6" ry="3" fill="#3d2c30" />
        <path v-else d="M51 92 Q60 84.5 69 92" fill="none" stroke="#3d2c30" stroke-width="2" stroke-linecap="round" />

        <!-- tears -->
        <g v-if="face === 'sad'" class="tears">
          <path d="M27 72 Q24 80 27 84 Q30 80 27 72 Z" fill="#8fd0f5" />
          <path d="M93 72 Q90 80 93 84 Q96 80 93 72 Z" fill="#8fd0f5" />
        </g>

        <!-- whiskers: gently curved, twitching when the cat sniffs -->
        <g class="whiskers left" fill="none" stroke="#fff" stroke-width="1.05" stroke-linecap="round" opacity="0.9">
          <path d="M25 85 Q13 81.6 2 81.8 M25 89 Q13 88.4 3 91.2 M26 93 Q15 95.4 5 100.4" />
        </g>
        <g class="whiskers right" fill="none" stroke="#fff" stroke-width="1.05" stroke-linecap="round" opacity="0.9">
          <path d="M95 85 Q107 81.6 118 81.8 M95 89 Q107 88.4 117 91.2 M94 93 Q105 95.4 115 100.4" />
        </g>
      </g>
    </g>
  </svg>
</template>

<style scoped>
.cat-face {
  overflow: visible;
}

.tilt {
  transform-box: fill-box;
  transform-origin: 50% 92%;
  transition: transform 0.55s cubic-bezier(0.45, 0, 0.25, 1);
}

.ear {
  transform-box: fill-box;
  transition: transform 0.12s cubic-bezier(0.3, 0.7, 0.4, 1);
}

.ear.left {
  transform-origin: 75% 95%;
}

.ear.right {
  transform-origin: 25% 95%;
}

.iris {
  transition: transform 0.16s cubic-bezier(0.3, 0.8, 0.4, 1);
}

.pupil {
  transform-box: fill-box;
  transform-origin: center;
  transition: transform 0.45s ease-out;
}

/* Slow breathing, at each cat's own pace. */
.idle .body {
  transform-box: fill-box;
  transform-origin: 50% 100%;
  animation: breathe var(--breath, 3.4s) ease-in-out infinite alternate;
}

.nose,
.whiskers {
  transform-box: fill-box;
}

.nose {
  transform-origin: 50% 30%;
}

.whiskers.left {
  transform-origin: 100% 30%;
}

.whiskers.right {
  transform-origin: 0 30%;
}

.sniffing .nose {
  animation: sniff 0.22s ease-in-out 3;
}

.sniffing .whiskers.left {
  animation: whisk-l 0.22s ease-in-out 3;
}

.sniffing .whiskers.right {
  animation: whisk-r 0.22s ease-in-out 3;
}

.yawn-mouth {
  transform-box: fill-box;
  transform-origin: 50% 0;
  animation: yawn 1.7s ease-in-out;
}

.sad .tears {
  animation: drip 1.6s ease-in infinite;
}

@keyframes breathe {
  to {
    transform: scale(1.016, 1.028);
  }
}

@keyframes sniff {
  50% {
    transform: scale(1.06, 0.88) translateY(0.4px);
  }
}

@keyframes whisk-l {
  50% {
    transform: rotate(4deg);
  }
}

@keyframes whisk-r {
  50% {
    transform: rotate(-4deg);
  }
}

@keyframes yawn {
  0% {
    transform: scaleY(0.2);
  }
  30%,
  70% {
    transform: scaleY(1);
  }
  100% {
    transform: scaleY(0.3);
  }
}

@keyframes drip {
  from {
    transform: translateY(-2px);
    opacity: 0;
  }
  30% {
    opacity: 1;
  }
  to {
    transform: translateY(9px);
    opacity: 0;
  }
}
</style>
