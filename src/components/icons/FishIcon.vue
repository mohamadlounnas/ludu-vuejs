<script setup lang="ts">
import { useId } from 'vue'

/** Golden fish cracker used as a life. `lost` greys it out. */
defineProps<{ lost?: boolean }>()
const id = useId()
</script>

<template>
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <linearGradient :id="id" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" :stop-color="lost ? '#e6dfd9' : '#ffd25a'" />
        <stop offset="1" :stop-color="lost ? '#d3cac2' : '#f0a020'" />
      </linearGradient>
    </defs>
    <g transform="translate(0 10) rotate(32 50 40)">
      <path
        d="M6 40 C8 10 48 4 64 30 L80 15 C87 10 94 15 91 23 L85 40 L91 57 C94 65 87 70 80 65 L64 50 C48 76 8 70 6 40 Z"
        :fill="`url(#${id})`"
        :stroke="lost ? '#cfc5bc' : '#e08e14'"
        stroke-width="3"
        stroke-linejoin="round"
      />
      <path d="M34 50 Q42 62 52 52" :stroke="lost ? '#cfc5bc' : '#e08e14'" stroke-width="3" fill="none" stroke-linecap="round" />
      <path d="M40 22 Q46 16 54 22" :stroke="lost ? '#cfc5bc' : '#e08e14'" stroke-width="3" fill="none" stroke-linecap="round" />
      <circle cx="22" cy="35" r="4.5" :fill="lost ? '#bdb2a8' : '#6b4214'" />
      <circle cx="23.5" cy="33.5" r="1.4" fill="#fff" />
      <ellipse cx="34" cy="28" rx="7" ry="3" fill="#fff" opacity="0.45" />
    </g>
  </svg>
</template>
