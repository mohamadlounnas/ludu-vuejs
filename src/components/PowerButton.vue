<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  count: number
  label: string
  nudge?: boolean
  /** Bumped each time the power-up is used: its icon lights up. */
  flash?: number
}>()
defineEmits<{ use: [] }>()

const el = ref<HTMLButtonElement | null>(null)
const SHADOW = 'drop-shadow(0 0.4cqw 0.5cqw rgb(0 0 0 / 0.12))'
// Switches on fast, then the glow fades out slowly, like a filament cooling.
watch(
  () => props.flash,
  () =>
    el.value?.querySelector('svg')?.animate(
      [
        { filter: `${SHADOW} drop-shadow(0 0 0 rgb(255 210 63 / 0))`, easing: 'ease-out' },
        { filter: `${SHADOW} drop-shadow(0 0 3cqw #ffd23f)`, offset: 0.2, easing: 'ease-in-out' },
        { filter: `${SHADOW} drop-shadow(0 0 0 rgb(255 210 63 / 0))` },
      ],
      { duration: 600 },
    ),
)
</script>

<template>
  <button ref="el" class="power" :class="{ nudge }" :aria-label="`${label} (${count})`" :disabled="count === 0" @click="$emit('use')">
    <slot />
    <span class="badge">{{ count }}</span>
  </button>
</template>

<style scoped>
.power {
  position: relative;
  width: 15cqw;
  height: 15cqw;
  border: none;
  border-radius: 50%;
  background: var(--card);
  box-shadow: 0 1.4cqw 2.6cqw rgb(240 170 120 / 0.28);
  display: grid;
  place-items: center;
  padding: 0;
  /* Springy release: quick press-in, overshooting bounce back. */
  transition: transform 0.45s cubic-bezier(0.34, 1.9, 0.64, 1);
}

/* Idle nudge: a gentle wiggle to suggest a hint. */
.nudge {
  animation: wiggle 1.6s ease-in-out infinite;
}

@keyframes wiggle {
  0%,
  60%,
  100% {
    transform: none;
  }
  70% {
    transform: rotate(-10deg) scale(1.06);
  }
  80% {
    transform: rotate(9deg) scale(1.06);
  }
  90% {
    transform: rotate(-5deg);
  }
}

.power:active:not(:disabled) {
  transform: scale(0.86);
  transition-duration: 0.08s;
}

.power:disabled {
  opacity: 0.55;
}

.power :deep(svg) {
  width: 9.6cqw;
  height: 9.6cqw;
  filter: drop-shadow(0 0.4cqw 0.5cqw rgb(0 0 0 / 0.12));
}

/* Red pill badge hanging off the top-right, like the original. */
.badge {
  position: absolute;
  top: -1.9cqw;
  right: -2.6cqw;
  min-width: 5.8cqw;
  height: 4.3cqw;
  padding: 0 0.6cqw;
  border-radius: 2.15cqw;
  background: #e8323a;
  color: #fff;
  font-family: system-ui, sans-serif;
  font-size: 3.7cqw;
  font-weight: 500;
  line-height: 4.3cqw;
}
</style>
