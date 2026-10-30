<script setup lang="ts">
/** Flat cat head in a region's pastel color, shown until that region has its cat. */
defineProps<{ color: string }>()
</script>

<template>
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <g :fill="color" :stroke="color" stroke-width="6" stroke-linejoin="round">
      <path d="M12 52 L15 12 Q17 5 24 9 L46 28 Z" />
      <path d="M88 52 L85 12 Q83 5 76 9 L54 28 Z" />
      <ellipse cx="50" cy="60" rx="42" ry="34" />
    </g>
  </svg>
</template>
