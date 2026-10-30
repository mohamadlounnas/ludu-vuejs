<script setup lang="ts">
import { computed, useId } from 'vue'

/**
 * Chubby tuxedo cat head, drawn to read like the original's 3D renders:
 * shaded fur, a white mask over the lower face, glossy eyes in dark rings,
 * blush, a pink nose and fine whiskers.
 *
 * Moods: `happy` (default), `wink` (cheeky, mouth open), `worried`, `sad`
 * (teary), `joy` (eyes squeezed shut, big smile).
 * `look` (-1..1 on each axis) points the irises, e.g. at the player's finger.
 * Idle life (blink, ear twitch, breathing) runs unless `still` is set;
 * `--blink-delay` / `--twitch-delay` offset it per cat.
 */
const props = withDefaults(
  defineProps<{
    mood?: 'happy' | 'wink' | 'worried' | 'sad' | 'joy'
    look?: { x: number; y: number }
    still?: boolean
  }>(),
  { mood: 'happy', look: () => ({ x: 0, y: 0 }), still: false },
)

const id = useId()
const url = (name: string) => `url(#${id}-${name})`
const irisShift = computed(() => `translate(${props.look.x * 2.6}px, ${props.look.y * 2.2}px)`)
const openEyes = computed(() => props.mood === 'happy' || props.mood === 'worried' || props.mood === 'sad')
const irisR = computed(() => (props.mood === 'worried' ? 7 : props.mood === 'sad' ? 9 : 9.6))
</script>

<template>
  <svg viewBox="0 0 120 112" aria-hidden="true" :class="['cat-face', mood, { idle: !still }]">
    <defs>
      <radialGradient :id="`${id}-fur`" cx="0.38" cy="0.22" r="0.85">
        <stop offset="0" stop-color="#55555f" />
        <stop offset="0.5" stop-color="#26262d" />
        <stop offset="1" stop-color="#0f0f13" />
      </radialGradient>
      <radialGradient :id="`${id}-mask`" cx="0.5" cy="0.32" r="0.75">
        <stop offset="0.5" stop-color="#ffffff" />
        <stop offset="0.85" stop-color="#eeecf2" />
        <stop offset="1" stop-color="#d6d2dd" />
      </radialGradient>
      <linearGradient :id="`${id}-ear`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#7a4652" />
        <stop offset="1" stop-color="#c88593" />
      </linearGradient>
      <radialGradient :id="`${id}-eye`" cx="0.45" cy="0.35" r="0.7">
        <stop offset="0.6" stop-color="#ffffff" />
        <stop offset="1" stop-color="#d9dbe6" />
      </radialGradient>
      <radialGradient :id="`${id}-iris`" cx="0.42" cy="0.38" r="0.65">
        <stop offset="0" stop-color="#9a6a3e" />
        <stop offset="0.55" stop-color="#5a3620" />
        <stop offset="1" stop-color="#1c110a" />
      </radialGradient>
      <linearGradient :id="`${id}-nose`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffb3c0" />
        <stop offset="1" stop-color="#e46d82" />
      </linearGradient>
    </defs>

    <!-- soft contact shadow -->
    <ellipse cx="60" cy="108" rx="36" ry="3.5" fill="#000" opacity="0.16" />

    <g class="body">
      <!-- ears (behind the head), each twitching on its own -->
      <g class="ear left">
        <path d="M10 62 C6 42 8 22 17 10 C20 6 25 6 29 10 L50 34 Z" :fill="url('fur')" stroke="#0f0f13" stroke-width="2" stroke-linejoin="round" />
        <path d="M17 50 C15 36 17 24 22 16 L42 35 Z" :fill="url('ear')" />
      </g>
      <g class="ear right">
        <path d="M110 62 C114 42 112 22 103 10 C100 6 95 6 91 10 L70 34 Z" :fill="url('fur')" stroke="#0f0f13" stroke-width="2" stroke-linejoin="round" />
        <path d="M103 50 C105 36 103 24 98 16 L78 35 Z" :fill="url('ear')" />
      </g>

      <!-- head and white mask -->
      <path
        d="M60 30 C92 30 112 44 115 64 C118 84 106 99 88 104 C79 106.5 70 107 60 107 C50 107 41 106.5 32 104 C14 99 2 84 5 64 C8 44 28 30 60 30 Z"
        :fill="url('fur')"
      />
      <ellipse cx="50" cy="38" rx="26" ry="6" fill="#fff" opacity="0.1" />
      <path
        d="M60 40 C57 48 55 54 51 59 C44 63 30 62 18 70 C8 78 12 98 32 104 C42 107 52 107 60 107 C68 107 78 107 88 104 C108 98 112 78 102 70 C90 62 76 63 69 59 C65 54 63 48 60 40 Z"
        :fill="url('mask')"
      />

      <!-- cheeks -->
      <ellipse cx="25" cy="84" rx="8" ry="4.2" fill="#f7a2b6" :opacity="mood === 'joy' || mood === 'wink' ? 0.75 : 0.45" />
      <ellipse cx="95" cy="84" rx="8" ry="4.2" fill="#f7a2b6" :opacity="mood === 'joy' || mood === 'wink' ? 0.75 : 0.45" />

      <!-- brows for worried / sad -->
      <path
        v-if="mood === 'worried' || mood === 'sad'"
        d="M25 50 L43 45 M95 50 L77 45"
        stroke="#fff"
        stroke-width="3"
        stroke-linecap="round"
        opacity="0.9"
      />

      <!-- eyes -->
      <g v-if="openEyes" class="eyes">
        <g v-for="cx in [37, 83]" :key="cx">
          <circle :cx="cx" cy="64" r="14.6" fill="#141418" />
          <circle :cx="cx" cy="64" :r="mood === 'worried' ? 13.2 : 12.6" :fill="url('eye')" />
          <g class="iris" :style="{ transform: irisShift }">
            <circle :cx="cx" :cy="mood === 'worried' ? 63 : 65" :r="irisR" :fill="url('iris')" />
            <circle :cx="cx" :cy="mood === 'worried' ? 63 : 65" :r="irisR * 0.55" fill="#0b0b0e" />
            <circle :cx="cx - 3" :cy="mood === 'worried' ? 59.6 : 61.4" :r="irisR * 0.34" fill="#fff" />
            <circle :cx="cx + 3.2" :cy="mood === 'worried' ? 66 : 68.4" r="1.3" fill="#fff" opacity="0.9" />
          </g>
          <!-- upper lid shading -->
          <path :d="`M${cx - 12} 60.5 Q${cx} 48.5 ${cx + 12} 60.5`" fill="none" stroke="#141418" stroke-width="2.4" opacity="0.45" />
          <!-- wet lower lid when sad -->
          <path v-if="mood === 'sad'" :d="`M${cx - 9} 71 Q${cx} 77 ${cx + 9} 71`" fill="none" stroke="#9fd8f7" stroke-width="2.2" stroke-linecap="round" />
        </g>
      </g>

      <!-- wink: left eye shut, right eye open -->
      <g v-else-if="mood === 'wink'">
        <path d="M26 66 Q37 57 48 66" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" />
        <path d="M26 66 Q37 57 48 66" fill="none" stroke="#141418" stroke-width="3.4" stroke-linecap="round" />
        <g class="eyes">
          <circle cx="83" cy="64" r="14.6" fill="#141418" />
          <circle cx="83" cy="64" r="12.6" :fill="url('eye')" />
          <circle cx="83" cy="65" r="9.6" :fill="url('iris')" />
          <circle cx="83" cy="65" r="5.3" fill="#0b0b0e" />
          <circle cx="79.8" cy="61" r="3.3" fill="#fff" />
          <circle cx="86.4" cy="68.6" r="1.4" fill="#fff" opacity="0.9" />
        </g>
      </g>

      <!-- joy: both eyes squeezed into happy arcs -->
      <g v-else>
        <path v-for="cx in [37, 83]" :key="cx" :d="`M${cx - 11} 67 Q${cx} 56 ${cx + 11} 67`" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" />
        <path v-for="cx in [37, 83]" :key="`i${cx}`" :d="`M${cx - 11} 67 Q${cx} 56 ${cx + 11} 67`" fill="none" stroke="#141418" stroke-width="3.4" stroke-linecap="round" />
      </g>

      <!-- nose -->
      <path d="M54.5 76 Q60 73 65.5 76 Q63.5 80.8 60 82.4 Q56.5 80.8 54.5 76 Z" :fill="url('nose')" />
      <ellipse cx="58.4" cy="76.6" rx="1.8" ry="0.9" fill="#fff" opacity="0.75" />

      <!-- mouth -->
      <template v-if="mood === 'happy'">
        <path d="M60 82.4 V85 M52.5 85.2 Q56.2 89.6 60 85.2 Q63.8 89.6 67.5 85.2" fill="none" stroke="#3d2c30" stroke-width="1.7" stroke-linecap="round" />
      </template>
      <template v-else-if="mood === 'wink' || mood === 'joy'">
        <path d="M49 85 Q60 101 71 85 Q60 89 49 85 Z" fill="#6e2632" stroke="#3d2c30" stroke-width="1.4" stroke-linejoin="round" />
        <ellipse cx="60" cy="93.2" rx="5.4" ry="3.4" fill="#f27a8f" />
      </template>
      <template v-else-if="mood === 'worried'">
        <ellipse cx="60" cy="89" rx="3.6" ry="3" fill="#3d2c30" />
      </template>
      <template v-else>
        <path d="M51 92 Q60 84.5 69 92" fill="none" stroke="#3d2c30" stroke-width="2" stroke-linecap="round" />
      </template>

      <!-- tears -->
      <g v-if="mood === 'sad'" class="tears">
        <path d="M27 72 Q24 80 27 84 Q30 80 27 72 Z" fill="#8fd0f5" />
        <path d="M93 72 Q90 80 93 84 Q96 80 93 72 Z" fill="#8fd0f5" />
      </g>

      <!-- whiskers -->
      <g stroke="#fff" stroke-width="1.1" stroke-linecap="round" opacity="0.88">
        <path d="M24 85 L2 81.5 M24 89 L3 90.5 M25 93 L5 99" />
        <path d="M96 85 L118 81.5 M96 89 L117 90.5 M95 93 L115 99" />
      </g>
    </g>
  </svg>
</template>

<style scoped>
.cat-face {
  overflow: visible;
}

.iris {
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* Idle life: blink, ear twitch, slow breathing — all offset per cat. */
.idle .eyes {
  transform-box: fill-box;
  transform-origin: center;
  animation: blink 5.2s infinite;
  animation-delay: var(--blink-delay, 1.3s);
}

.idle .ear {
  transform-box: fill-box;
  animation: twitch 7.4s infinite;
  animation-delay: var(--twitch-delay, 2.1s);
}

.idle .ear.left {
  transform-origin: 75% 95%;
}

.idle .ear.right {
  transform-origin: 25% 95%;
  animation-delay: calc(var(--twitch-delay, 2.1s) + 3.1s);
}

.idle .body {
  transform-box: fill-box;
  transform-origin: 50% 100%;
  animation: breathe 3.4s ease-in-out infinite alternate;
  animation-delay: calc(var(--blink-delay, 0s) * -1);
}

.sad .tears {
  animation: drip 1.6s ease-in infinite;
}

@keyframes blink {
  0%,
  94.5%,
  100% {
    transform: none;
    animation-timing-function: ease-in;
  }
  95.8%,
  96.8% {
    transform: scaleY(0.08);
    animation-timing-function: ease-out;
  }
}

@keyframes twitch {
  0%,
  90%,
  100% {
    transform: none;
  }
  92% {
    transform: rotate(-13deg);
  }
  94% {
    transform: rotate(5deg);
  }
  96% {
    transform: rotate(-4deg);
  }
}

@keyframes breathe {
  to {
    transform: scale(1.018, 1.03);
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
