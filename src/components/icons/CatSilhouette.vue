<script setup lang="ts">
/** Flat cat head (same outline as CatFace) in a region's pastel colour, shown until that region has its cat. */
defineProps<{ color: string }>()
</script>

<template>
  <svg viewBox="0 0 120 112" aria-hidden="true">
    <g :fill="color" :stroke="color" stroke-width="3" stroke-linejoin="round">
      <path d="M10 62 C6 42 8 22 17 10 C20 6 25 6 29 10 L50 34 Z" />
      <path d="M110 62 C114 42 112 22 103 10 C100 6 95 6 91 10 L70 34 Z" />
      <path d="M60 30 C92 30 112 44 115 64 C118 84 106 99 88 104 C79 106.5 70 107 60 107 C50 107 41 106.5 32 104 C14 99 2 84 5 64 C8 44 28 30 60 30 Z" />
    </g>
  </svg>
</template>
