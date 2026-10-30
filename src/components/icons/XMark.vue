<script setup lang="ts">
/**
 * X drawn as two strokes, like a pen. `delay` (ms) holds it back for the
 * auto-cross wave; `halo` adds an outline so test inks read on any colour.
 */
withDefaults(defineProps<{ delay?: number; animate?: boolean; halo?: string }>(), {
  delay: 0,
  animate: true,
  halo: '',
})
</script>

<template>
  <svg viewBox="0 0 100 100" aria-hidden="true" :class="{ draw: animate }" :style="{ '--d': `${delay}ms` }">
    <g v-if="halo" class="halo" :style="{ stroke: halo }">
      <path d="M32 32 L68 68" pathLength="1" />
      <path d="M68 32 L32 68" pathLength="1" />
    </g>
    <g class="strokes">
      <path d="M32 32 L68 68" pathLength="1" />
      <path d="M68 32 L32 68" pathLength="1" />
    </g>
  </svg>
</template>

<style scoped>
path {
  stroke-width: 21;
  stroke-linecap: round;
  fill: none;
}

.strokes path {
  stroke: currentColor;
}

.halo path {
  stroke-width: 31;
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
