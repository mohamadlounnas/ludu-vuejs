<script setup lang="ts">
/** Brown header icons: back arrow and settings gear. */
defineProps<{ name: 'back' | 'gear' }>()
</script>

<template>
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <path
      v-if="name === 'back'"
      d="M21 11 L8 24 L21 37 M9 24 H40"
      stroke="currentColor"
      stroke-width="5.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      fill="none"
    />
    <g v-else fill="currentColor">
      <rect v-for="a in [0, 45, 90, 135]" :key="a" x="19" y="4" width="10" height="40" rx="3" :transform="`rotate(${a} 24 24)`" />
      <circle cx="24" cy="24" r="14" />
      <circle cx="24" cy="24" r="6" fill="#fff" />
    </g>
  </svg>
</template>
