<script setup lang="ts">
import { useId } from 'vue'

/** Grey mouse head for the "clear mistakes" power-up, shaded to match the cats. */
const id = useId()
</script>

<template>
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <radialGradient :id="`${id}-fur`" cx="0.4" cy="0.3" r="0.8">
        <stop offset="0" stop-color="#d4d0d2" />
        <stop offset="0.6" stop-color="#aaa5a8" />
        <stop offset="1" stop-color="#7f7a7e" />
      </radialGradient>
      <radialGradient :id="`${id}-ear`" cx="0.5" cy="0.45" r="0.6">
        <stop offset="0" stop-color="#ffd0d8" />
        <stop offset="1" stop-color="#ec9aaa" />
      </radialGradient>
      <radialGradient :id="`${id}-snout`" cx="0.5" cy="0.3" r="0.7">
        <stop offset="0" stop-color="#f3f1f2" />
        <stop offset="1" stop-color="#c9c4c7" />
      </radialGradient>
    </defs>
    <ellipse cx="50" cy="94" rx="26" ry="3" fill="#000" opacity="0.15" />
    <!-- ears -->
    <circle cx="21" cy="33" r="19" :fill="`url(#${id}-fur)`" />
    <circle cx="79" cy="33" r="19" :fill="`url(#${id}-fur)`" />
    <circle cx="22" cy="34" r="12.5" :fill="`url(#${id}-ear)`" />
    <circle cx="78" cy="34" r="12.5" :fill="`url(#${id}-ear)`" />
    <!-- head -->
    <path d="M50 30 C70 30 82 44 82 60 C82 78 68 90 50 90 C32 90 18 78 18 60 C18 44 30 30 50 30 Z" :fill="`url(#${id}-fur)`" />
    <ellipse cx="44" cy="40" rx="14" ry="5" fill="#fff" opacity="0.25" />
    <ellipse cx="50" cy="73" rx="17" ry="13" :fill="`url(#${id}-snout)`" />
    <!-- cheeks -->
    <ellipse cx="30" cy="68" rx="5" ry="3" fill="#f7a2b6" opacity="0.55" />
    <ellipse cx="70" cy="68" rx="5" ry="3" fill="#f7a2b6" opacity="0.55" />
    <!-- eyes -->
    <g v-for="cx in [38, 62]" :key="cx">
      <circle :cx="cx" cy="57" r="5.6" fill="#1b1b20" />
      <circle :cx="cx - 1.6" :cy="55.2" r="2" fill="#fff" />
      <circle :cx="cx + 1.8" :cy="59" r="0.9" fill="#fff" opacity="0.8" />
    </g>
    <!-- nose, mouth, teeth -->
    <ellipse cx="50" cy="66.5" rx="5" ry="3.8" fill="#ef8297" />
    <ellipse cx="48.6" cy="65.4" rx="1.6" ry="0.9" fill="#fff" opacity="0.7" />
    <path d="M50 70 V72.5 M45 73 Q47.5 76 50 72.5 Q52.5 76 55 73" fill="none" stroke="#5a4e53" stroke-width="1.4" stroke-linecap="round" />
    <path d="M46.2 75 H53.8 V81 Q50 82.5 46.2 81 Z" fill="#fff" stroke="#c9c2c6" stroke-width="0.9" />
    <path d="M50 75 V81.6" stroke="#c9c2c6" stroke-width="0.9" />
    <!-- whiskers -->
    <g stroke="#6f696d" stroke-width="1.1" stroke-linecap="round" opacity="0.8">
      <path d="M34 70 L14 66 M34 74 L15 76 M66 70 L86 66 M66 74 L85 76" />
    </g>
  </svg>
</template>
