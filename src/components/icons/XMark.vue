<script setup lang="ts">
/** X drawn as two strokes, like a pen. `delay` (ms) holds it back for the auto-cross wave. */
withDefaults(defineProps<{ delay?: number; animate?: boolean }>(), { delay: 0, animate: true })
</script>

<template>
  <svg viewBox="0 0 100 100" aria-hidden="true" :class="{ draw: animate }" :style="{ '--d': `${delay}ms` }">
    <path d="M32 32 L68 68" pathLength="1" />
    <path d="M68 32 L32 68" pathLength="1" />
  </svg>
</template>

<style scoped>
path {
  stroke: currentColor;
  stroke-width: 21;
  stroke-linecap: round;
  fill: none;
}

.draw path {
  stroke-dasharray: 1;
  animation: draw 0.13s ease-out var(--d) backwards;
}

.draw path + path {
  animation-delay: calc(var(--d) + 0.12s);
}

@keyframes draw {
  from {
    stroke-dashoffset: 1;
  }
}
</style>
