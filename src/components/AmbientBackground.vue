<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { REGION_COLORS, pastel } from '../game/palette'

/**
 * A quiet, living backdrop: soft glows in the board's colours drift around,
 * and on the home screen an invisible cat now and then strolls across,
 * leaving a trail of paw prints that press in and fade. `calm` keeps
 * everything still. The parent must create a stacking context (e.g.
 * `isolation: isolate`): this layer sits behind its content.
 */
const props = withDefaults(defineProps<{ variant?: 'home' | 'game'; calm?: boolean }>(), {
  variant: 'home',
  calm: false,
})

/** Glow blobs: position (%), size (cqw), colour, drift path and pace. */
const GLOWS = [
  { x: 12, y: 18, size: 62, color: REGION_COLORS[9], dx: 9, dy: 6, dur: 26 },
  { x: 88, y: 30, size: 70, color: REGION_COLORS[5], dx: -8, dy: 9, dur: 31 },
  { x: 25, y: 72, size: 66, color: REGION_COLORS[3], dx: 7, dy: -8, dur: 29 },
  { x: 82, y: 82, size: 58, color: REGION_COLORS[1], dx: -9, dy: -6, dur: 24 },
  { x: 55, y: 48, size: 50, color: REGION_COLORS[7], dx: 6, dy: 7, dur: 34 },
]

interface Print {
  id: number
  x: number
  y: number
  angle: number
  delay: number
  left: boolean
}

const prints = ref<Print[]>([])
let nextId = 0
const timers = new Set<number>()
const later = (fn: () => void, ms: number) => {
  const t = window.setTimeout(() => {
    timers.delete(t)
    fn()
  }, ms)
  timers.add(t)
}
const rand = (min: number, max: number) => min + Math.random() * (max - min)

const STEP = 7.5 // % of the screen between prints
const STRIDE_MS = 360
const FADE_MS = 2800

/** One stroll: a gently curving line of alternating left/right prints. */
function stroll() {
  if (props.calm || document.visibilityState === 'hidden') {
    later(stroll, 4000)
    return
  }
  // Enter from one side, heading across with a little drift.
  const fromLeft = Math.random() < 0.5
  let x = fromLeft ? -4 : 104
  let y = rand(18, 82)
  let heading = (fromLeft ? 0 : Math.PI) + rand(-0.45, 0.45)
  const turn = rand(-0.06, 0.06)
  const steps = 13 + Math.floor(rand(0, 5))
  const trail: Print[] = []
  for (let i = 0; i < steps; i++) {
    const left = i % 2 === 0
    const side = (left ? -1 : 1) * 1.6
    trail.push({
      id: nextId++,
      x: x + Math.cos(heading + Math.PI / 2) * side,
      y: y + Math.sin(heading + Math.PI / 2) * side * 0.55,
      angle: (heading * 180) / Math.PI + 90,
      delay: i * STRIDE_MS,
      left,
    })
    x += Math.cos(heading) * STEP
    y += Math.sin(heading) * STEP * 0.55
    heading += turn
  }
  prints.value = [...prints.value, ...trail]
  const ids = new Set(trail.map((p) => p.id))
  later(() => (prints.value = prints.value.filter((p) => !ids.has(p.id))), steps * STRIDE_MS + FADE_MS + 200)
  later(stroll, steps * STRIDE_MS + rand(5000, 11000))
}

onMounted(() => {
  if (props.variant === 'home') later(stroll, rand(1200, 2500))
})
onBeforeUnmount(() => timers.forEach(clearTimeout))
</script>

<template>
  <!-- `is-*` class names, so the parent screens' own `.home` / `.game` styles can't match this root. -->
  <div class="ambient" :class="[`is-${variant}`, { calm }]" aria-hidden="true">
    <i
      v-for="(g, n) in GLOWS"
      :key="n"
      class="glow"
      :style="{
        left: `${g.x}%`,
        top: `${g.y}%`,
        '--size': `${g.size}cqw`,
        '--c': pastel(g.color),
        '--dx': `${g.dx}cqw`,
        '--dy': `${g.dy}cqw`,
        animationDuration: `${g.dur}s`,
        animationDelay: `${-n * 4.7}s`,
      }"
    />
    <svg
      v-for="p in prints"
      :key="p.id"
      class="paw"
      viewBox="0 0 40 40"
      :style="{ left: `${p.x}%`, top: `${p.y}%`, '--a': `${p.angle}deg`, animationDelay: `${p.delay}ms`, animationDuration: `${FADE_MS}ms` }"
    >
      <ellipse cx="20" cy="26" rx="9" ry="7.5" />
      <ellipse cx="9.5" cy="15" rx="3.6" ry="4.6" transform="rotate(-20 9.5 15)" />
      <ellipse cx="16" cy="9.5" rx="3.6" ry="4.8" transform="rotate(-6 16 9.5)" />
      <ellipse cx="24" cy="9.5" rx="3.6" ry="4.8" transform="rotate(6 24 9.5)" />
      <ellipse cx="30.5" cy="15" rx="3.6" ry="4.6" transform="rotate(20 30.5 15)" />
    </svg>
  </div>
</template>

<style scoped>
.ambient {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
}

.glow {
  position: absolute;
  width: var(--size);
  aspect-ratio: 1;
  translate: -50% -50%;
  border-radius: 50%;
  background: radial-gradient(circle, var(--c) 0%, transparent 68%);
  opacity: 0.55;
  /* Static ambient colour avoids five full-screen composited layers. */
}

.is-game .glow {
  opacity: 0.32;
}

.paw {
  position: absolute;
  width: 6.4cqw;
  translate: -50% -50%;
  rotate: var(--a);
  fill: #e4d3c8;
  opacity: 0;
  animation: press ease-out both;
}

.calm .glow {
  animation: none;
}

@keyframes drift {
  from {
    transform: translate(0, 0) scale(1);
  }
  to {
    transform: translate(var(--dx), var(--dy)) scale(1.12);
  }
}

/* A paw comes down (a little squash), stays a while, then fades into the floor. */
@keyframes press {
  0% {
    opacity: 0;
    transform: scale(1.35);
  }
  6% {
    opacity: 0.9;
    transform: scale(0.94);
  }
  12% {
    transform: scale(1);
  }
  55% {
    opacity: 0.75;
  }
  100% {
    opacity: 0;
    transform: scale(1);
  }
}
</style>
