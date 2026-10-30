<script setup lang="ts">
/** Tuxedo cat head. `wink` is the cheeky open-mouth version on the cat power-up. */
defineProps<{ wink?: boolean }>()
</script>

<template>
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <path d="M12 52 L15 12 Q17 5 24 9 L46 28 Z" fill="#232328" stroke="#232328" stroke-width="4" stroke-linejoin="round" />
    <path d="M88 52 L85 12 Q83 5 76 9 L54 28 Z" fill="#232328" stroke="#232328" stroke-width="4" stroke-linejoin="round" />
    <path d="M21 38 L23 17 L37 29 Z" fill="#f4a9b4" />
    <path d="M79 38 L77 17 L63 29 Z" fill="#f4a9b4" />
    <ellipse cx="50" cy="60" rx="43" ry="35" fill="#232328" />
    <path
      d="M50 30 C46 40 42 49 33 58 C20 70 25 94 50 94 C75 94 80 70 67 58 C58 49 54 40 50 30 Z"
      fill="#fff"
    />
    <template v-if="wink">
      <path d="M26 54 Q34 47 42 54" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none" />
      <circle cx="66" cy="54" r="9.5" fill="#fff" />
      <circle cx="66" cy="55" r="6" fill="#232328" />
      <circle cx="68.5" cy="52" r="2" fill="#fff" />
      <path d="M46 66 Q50 63 54 66 Q50 71 50 71 Q50 71 46 66 Z" fill="#f08a9a" />
      <path d="M40 74 Q50 92 60 74 Z" fill="#7d2f3c" />
      <ellipse cx="50" cy="82" rx="6" ry="4" fill="#f27d8f" />
    </template>
    <template v-else>
      <circle cx="34" cy="54" r="9.5" fill="#fff" />
      <circle cx="66" cy="54" r="9.5" fill="#fff" />
      <circle cx="35" cy="55" r="6" fill="#232328" />
      <circle cx="65" cy="55" r="6" fill="#232328" />
      <circle cx="37.5" cy="52" r="2" fill="#fff" />
      <circle cx="67.5" cy="52" r="2" fill="#fff" />
      <path d="M46 67 Q50 64 54 67 Q50 72 50 72 Q50 72 46 67 Z" fill="#f08a9a" />
      <path d="M43 76 Q46.5 80 50 76 Q53.5 80 57 76" stroke="#3a3a40" stroke-width="2" stroke-linecap="round" fill="none" />
    </template>
  </svg>
</template>
