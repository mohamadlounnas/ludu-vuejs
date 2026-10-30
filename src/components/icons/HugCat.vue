<script setup lang="ts">
import { useId } from 'vue'
import CatFace from './CatFace.vue'

/**
 * Tuxedo cat hugging a fish cracker: crying over a broken one (game over)
 * or beaming with a whole one (win). Uses the same head as the board cats.
 */
defineProps<{ happy?: boolean }>()
const id = useId()
</script>

<template>
  <svg viewBox="0 0 200 236" aria-hidden="true" class="hug" :class="{ happy }">
    <defs>
      <radialGradient :id="`${id}-fur`" cx="0.4" cy="0.25" r="0.85">
        <stop offset="0" stop-color="#4c4c56" />
        <stop offset="0.55" stop-color="#24242b" />
        <stop offset="1" stop-color="#0f0f13" />
      </radialGradient>
      <radialGradient :id="`${id}-belly`" cx="0.5" cy="0.35" r="0.7">
        <stop offset="0.55" stop-color="#ffffff" />
        <stop offset="1" stop-color="#dcd8e2" />
      </radialGradient>
      <linearGradient :id="`${id}-fish`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffd76a" />
        <stop offset="1" stop-color="#f0a21f" />
      </linearGradient>
    </defs>

    <ellipse cx="100" cy="226" rx="62" ry="7" fill="#000" opacity="0.25" />
    <!-- tail -->
    <path class="tail" d="M52 196 C16 196 10 160 28 146" stroke="#1a1a20" stroke-width="13" stroke-linecap="round" fill="none" />
    <circle class="tail" cx="28" cy="146" r="7.5" fill="#fff" />
    <!-- body -->
    <path d="M58 128 C42 142 36 176 42 200 C46 216 66 222 100 222 C134 222 154 216 158 200 C164 176 158 142 142 128 C128 118 72 118 58 128 Z" :fill="`url(#${id}-fur)`" />
    <path d="M76 128 C84 116 116 116 124 128 C134 150 134 186 124 204 C112 214 88 214 76 204 C66 186 66 150 76 128 Z" :fill="`url(#${id}-belly)`" />
    <!-- feet -->
    <ellipse cx="74" cy="214" rx="20" ry="11" fill="#fff" />
    <ellipse cx="126" cy="214" rx="20" ry="11" fill="#fff" />
    <path d="M66 216 V208 M74 218 V208 M82 216 V208 M118 216 V208 M126 218 V208 M134 216 V208" stroke="#d6cfd3" stroke-width="2" stroke-linecap="round" />

    <!-- fish cracker: whole when happy, snapped in two when sad -->
    <g transform="translate(100 160) rotate(-8)">
    <g v-if="happy" class="fish">
      <path d="M-42 0 C-38 -27 0 -33 14 -10 L34 -24 C40 -28 46 -22 42 -14 L36 0 L42 14 C46 22 40 28 34 24 L14 10 C0 33 -38 27 -42 0 Z" :fill="`url(#${id}-fish)`" stroke="#df9214" stroke-width="3" stroke-linejoin="round" />
      <path d="M-8 -14 Q-2 -6 -8 2 M2 -12 Q8 -4 2 4" stroke="#df9214" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="0.7" />
      <circle cx="-26" cy="-6" r="3.6" fill="#6b4214" />
      <circle cx="-25" cy="-7.3" r="1.2" fill="#fff" />
    </g>
    <g v-else class="fish">
      <path d="M-36 -2 C-36 -27 -6 -31 2 -12 L-3 -2 L4 8 L2 26 C-14 34 -36 22 -36 -2 Z" :fill="`url(#${id}-fish)`" stroke="#df9214" stroke-width="3" stroke-linejoin="round" />
      <path d="M10 -14 C16 -30 42 -24 44 -6 L54 -16 C60 -18 62 -10 58 -4 L52 6 L58 16 C60 24 52 26 48 20 L42 12 C36 30 16 34 10 24 L12 10 L5 -1 Z" :fill="`url(#${id}-fish)`" stroke="#df9214" stroke-width="3" stroke-linejoin="round" />
      <circle cx="-22" cy="-6" r="3.6" fill="#6b4214" />
    </g>
    </g>
    <!-- arms wrapped around the fish -->
    <path d="M60 130 C44 140 44 156 58 162 M140 130 C156 142 154 160 140 166" stroke="#1d1d23" stroke-width="17" stroke-linecap="round" fill="none" />
    <!-- paws over the fish -->
    <ellipse cx="62" cy="156" rx="15" ry="13" fill="#fff" />
    <ellipse cx="138" cy="162" rx="15" ry="13" fill="#fff" />

    <!-- head: the board cat, crying or overjoyed -->
    <g class="head">
      <CatFace :mood="happy ? 'joy' : 'sad'" x="22" y="4" width="156" height="146" />
    </g>
  </svg>
</template>

<style scoped>
.hug {
  overflow: visible;
}

.head {
  transform-box: fill-box;
  transform-origin: 50% 90%;
  animation: sob 1.3s ease-in-out infinite;
}

.happy .head {
  animation: cheer 0.9s ease-in-out infinite alternate;
}

.tail {
  transform-box: view-box;
  transform-origin: 52px 196px;
  animation: swish 2.4s ease-in-out infinite alternate;
}

.fish {
  transform-box: fill-box;
  transform-origin: center;
}

.happy .fish {
  animation: hold 0.9s ease-in-out infinite alternate;
}

@keyframes sob {
  0%,
  100% {
    transform: none;
  }
  20% {
    transform: translateY(2px) rotate(-1.5deg);
  }
  40% {
    transform: translateY(-1px) rotate(1deg);
  }
}

@keyframes cheer {
  from {
    transform: rotate(-4deg);
  }
  to {
    transform: rotate(4deg) translateY(-3px);
  }
}

@keyframes swish {
  to {
    transform: rotate(-12deg);
  }
}

@keyframes hold {
  to {
    transform: translateY(-3px) rotate(4deg);
  }
}
</style>
