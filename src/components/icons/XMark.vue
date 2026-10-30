<script setup lang="ts">
/**
 * X drawn as two strokes, like a pen. `delay` (ms) holds it back for the
 * auto-cross wave; `dur` is how long each stroke takes (a drag draws
 * faster); `halo` adds an outline so test inks read on any colour.
 */
const props = withDefaults(defineProps<{ delay?: number; animate?: boolean; dur?: number; halo?: string }>(), {
  delay: 0,
  animate: true,
  dur: 130,
  halo: '',
})

/** How the strokes draw is settled when the X appears: later prop changes never replay it. */
const draw = { animate: props.animate, delay: props.delay, dur: props.dur }
</script>

<template>
  <svg
    viewBox="0 0 100 100"
    aria-hidden="true"
    :class="{ draw: draw.animate }"
    :style="{ '--d': `${draw.delay}ms`, '--dur': `${draw.dur}ms` }"
  >
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
  animation: draw var(--dur) ease-out var(--d) backwards;
}

/* The second stroke starts just before the first one ends, so the pen keeps moving. */
.draw path + path {
  animation-delay: calc(var(--d) + var(--dur) - 10ms);
}

@keyframes draw {
  from {
    stroke-dashoffset: 1;
  }
}
</style>
