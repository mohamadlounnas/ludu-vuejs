<script setup lang="ts">
import { ref, useId, watch } from 'vue'
import CatFace from './CatFace.vue'

/**
 * The home-screen mascot: a tuxedo cat sitting on a round cushion, with
 * the board cats' living head (blinks, glances, yawns), slow breathing and a
 * lazily swishing tail. `look` points its eyes; `pet` (a counter) makes it
 * hop, lean into the touch and send up a few hearts.
 */
const props = withDefaults(defineProps<{ look?: { x: number; y: number }; pet?: number; still?: boolean }>(), {
  look: () => ({ x: 0, y: 0 }),
  pet: 0,
  still: false,
})

const id = useId()
// Every pet re-keys the body group, which restarts its hop.
const hop = ref(0)
watch(
  () => props.pet,
  () => hop.value++,
)
</script>

<template>
  <svg viewBox="0 0 200 230" class="sit-cat" :class="{ still }" aria-hidden="true">
    <defs>
      <radialGradient :id="`${id}-fur`" cx="0.4" cy="0.25" r="0.85">
        <stop offset="0" stop-color="#4c4c56" />
        <stop offset="0.55" stop-color="#24242b" />
        <stop offset="1" stop-color="#0f0f13" />
      </radialGradient>
      <radialGradient :id="`${id}-bib`" cx="0.5" cy="0.3" r="0.75">
        <stop offset="0.5" stop-color="#ffffff" />
        <stop offset="1" stop-color="#dcd7e2" />
      </radialGradient>
      <linearGradient :id="`${id}-cushion`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffd7b8" />
        <stop offset="1" stop-color="#ec9f7c" />
      </linearGradient>
    </defs>

    <!-- cushion and its shadow -->
    <ellipse cx="100" cy="222" rx="80" ry="6" fill="#000" opacity="0.12" />
    <ellipse cx="100" cy="206" rx="82" ry="20" :fill="`url(#${id}-cushion)`" />
    <ellipse cx="100" cy="199" rx="70" ry="11" fill="#fff" opacity="0.28" />
    <path d="M22 204 Q100 230 178 204" fill="none" stroke="#d98463" stroke-width="2" opacity="0.6" />

    <g :key="hop" class="whole" :class="{ hop: hop > 0 }">
      <!-- tail, swishing from its root behind the body -->
      <g class="tail">
        <path d="M138 196 C176 198 192 176 186 150 C183 138 174 132 166 134" fill="none" stroke="#17171c" stroke-width="15" stroke-linecap="round" />
        <circle cx="166" cy="134" r="7.6" fill="#fff" />
      </g>
      <!-- body and white bib -->
      <g class="chest">
        <path d="M60 136 C46 156 44 188 56 204 C74 214 126 214 144 204 C156 188 154 156 140 136 C126 124 74 124 60 136 Z" :fill="`url(#${id}-fur)`" />
        <path d="M78 132 C86 122 114 122 122 132 C131 152 129 184 118 200 C110 207 90 207 82 200 C71 184 69 152 78 132 Z" :fill="`url(#${id}-bib)`" />
        <!-- front paws -->
        <ellipse cx="85" cy="205" rx="14" ry="8.5" fill="#fff" />
        <ellipse cx="115" cy="205" rx="14" ry="8.5" fill="#fff" />
        <path d="M80 208 V202 M86 210 V202 M92 208 V202 M108 208 V202 M114 210 V202 M120 208 V202" stroke="#d6cfd3" stroke-width="1.8" stroke-linecap="round" />
      </g>
      <!-- the living head -->
      <g class="head">
        <CatFace :look="look" :pet="pet" :still="still" x="20" y="4" width="160" height="149" />
      </g>
    </g>
  </svg>
</template>

<style scoped>
.sit-cat {
  overflow: visible;
}

.tail {
  transform-box: view-box;
  transform-origin: 138px 196px;
  animation: swish 3.8s ease-in-out infinite alternate;
}

.chest {
  transform-box: fill-box;
  transform-origin: 50% 100%;
  animation: breathe 3.6s ease-in-out infinite alternate;
}

.head {
  transform-box: fill-box;
  transform-origin: 50% 100%;
  animation: bob 3.6s ease-in-out infinite alternate;
}

.still .tail,
.still .chest,
.still .head {
  animation: none;
}

/* Petted: a little crouch, a hop, and a soft landing. */
.whole.hop {
  transform-box: view-box;
  transform-origin: 100px 210px;
  animation: hop 0.62s both;
}

@keyframes swish {
  0% {
    transform: rotate(0);
  }
  60% {
    transform: rotate(-9deg);
  }
  100% {
    transform: rotate(-4deg);
  }
}

@keyframes breathe {
  to {
    transform: scale(1.025, 1.035);
  }
}

@keyframes bob {
  to {
    transform: translateY(-1.6px);
  }
}

@keyframes hop {
  0% {
    transform: none;
  }
  20% {
    transform: translateY(3px) scale(1.06, 0.92);
    animation-timing-function: cubic-bezier(0.2, 0.7, 0.3, 1);
  }
  50% {
    transform: translateY(-16px) scale(0.96, 1.05);
    animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45);
  }
  78% {
    transform: translateY(0) scale(1.05, 0.95);
  }
  100% {
    transform: none;
  }
}
</style>
