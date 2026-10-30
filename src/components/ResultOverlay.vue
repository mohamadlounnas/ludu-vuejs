<script setup lang="ts">
import { onBeforeUnmount } from 'vue'

/**
 * Full-screen result card styled after the original "out of fish" screen.
 * Its buttons ignore clicks for a moment after it appears, so the tap that
 * brought it up early (or a tap meant for the board) can't press one.
 */
defineProps<{ title: string; tone: 'lost' | 'won' }>()

/** Fixed (not random) so screenshots of the card are repeatable. */
const SPARKLES = [
  { x: 14, y: 22, size: 1, delay: 0 },
  { x: 84, y: 18, size: 0.8, delay: 0.6 },
  { x: 22, y: 52, size: 0.7, delay: 1.1 },
  { x: 80, y: 47, size: 1.1, delay: 0.3 },
  { x: 10, y: 74, size: 0.8, delay: 1.5 },
  { x: 90, y: 70, size: 0.9, delay: 0.9 },
  { x: 50, y: 10, size: 0.7, delay: 1.8 },
]
const DROPS = Array.from({ length: 34 }, (_, n) => ({
  x: (n * 37) % 103,
  len: 4 + ((n * 7) % 5),
  delay: ((n * 0.173) % 1.2).toFixed(2),
  dur: (0.85 + ((n * 0.091) % 0.5)).toFixed(2),
}))

const GUARD_MS = 250
let ready = false
const timer = window.setTimeout(() => (ready = true), GUARD_MS)
onBeforeUnmount(() => clearTimeout(timer))

const guard = (e: MouseEvent) => {
  if (ready) return
  e.stopPropagation()
  e.preventDefault()
}
</script>

<template>
  <div class="overlay" role="dialog" aria-modal="true" @click.capture="guard">
    <!-- Behind the card: slow sun rays and sparkles for a win, soft rain when out of fish. -->
    <div class="sky" :class="tone" aria-hidden="true">
      <template v-if="tone === 'won'">
        <i class="rays" />
        <i v-for="(s, n) in SPARKLES" :key="n" class="sparkle" :style="{ left: `${s.x}%`, top: `${s.y}%`, '--s': s.size, animationDelay: `${s.delay}s` }" />
      </template>
      <template v-else>
        <i v-for="(d, n) in DROPS" :key="n" class="drop" :style="{ left: `${d.x}%`, '--len': `${d.len}cqw`, animationDelay: `${d.delay}s`, animationDuration: `${d.dur}s` }" />
      </template>
    </div>
    <h2 :class="tone">{{ title }}</h2>
    <div class="art" :class="tone"><slot name="art" /></div>
    <slot />
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3cqw;
  padding: 6cqw 0 10cqw;
  background: rgb(28 30 38 / 0.86);
  animation: fade 0.35s ease-out;
  isolation: isolate;
}

.sky {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
}

/* Win: wide soft rays turning slowly behind the cat. */
.rays {
  position: absolute;
  left: 50%;
  top: 42%;
  width: 190cqw;
  aspect-ratio: 1;
  translate: -50% -50%;
  background: repeating-conic-gradient(rgb(255 214 90 / 0.16) 0deg 9deg, transparent 9deg 22.5deg);
  mask-image: radial-gradient(circle, #000 12%, transparent 62%);
  animation: spin 28s linear infinite, fade 0.8s ease-out;
}

.sparkle {
  position: absolute;
  width: calc(5cqw * var(--s));
  aspect-ratio: 1;
  background: #fff3c4;
  clip-path: polygon(50% 0, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0 50%, 39% 39%);
  filter: drop-shadow(0 0 1.2cqw #ffd23f);
  animation: twinkle 2.2s ease-in-out infinite;
}

/* Out of fish: thin slanted rain, falling at slightly different speeds. */
.drop {
  position: absolute;
  top: -12%;
  width: 0.35cqw;
  height: var(--len);
  border-radius: 999px;
  background: linear-gradient(transparent, rgb(170 205 255 / 0.55));
  rotate: 12deg;
  animation: rain linear infinite;
}

@keyframes spin {
  to {
    rotate: 360deg;
  }
}

@keyframes twinkle {
  0%,
  100% {
    transform: scale(0.3) rotate(0deg);
    opacity: 0.2;
  }
  50% {
    transform: scale(1) rotate(45deg);
    opacity: 1;
  }
}

@keyframes rain {
  from {
    transform: translate(0, 0);
  }
  to {
    transform: translate(-28cqw, 125vh);
  }
}

h2 {
  margin: 0;
  font-size: 11cqw;
  font-weight: 800;
  line-height: 1.2;
  paint-order: stroke fill;
  -webkit-text-stroke: 1.6cqw #fff;
  animation: drop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s backwards;
}

h2.lost {
  color: #4a95e6;
  text-shadow: 0 0.9cqw 0 #2f68b8;
}

h2.won {
  color: #f28a1e;
  text-shadow: 0 0.9cqw 0 #c4600c;
}

.art {
  position: relative;
  isolation: isolate;
  width: 52cqw;
  animation: rise 0.5s ease-out 0.2s backwards;
}

/* Won: slow sun rays turn behind the cat, fading out towards the edges. */
.art.won::before {
  content: '';
  position: absolute;
  z-index: -1;
  inset: -45%;
  border-radius: 50%;
  background: repeating-conic-gradient(#ffd23f33 0 10deg, transparent 10deg 20deg);
  mask-image: radial-gradient(closest-side, #000 35%, transparent);
  animation:
    fade 0.8s ease-out 0.3s backwards,
    spin 20s linear infinite;
}

.art :deep(svg) {
  width: 100%;
  display: block;
}

.overlay :deep(.big) {
  width: 69cqw;
  border: none;
  border-radius: 999px;
  padding: 2.6cqw 0;
  font-size: 7cqw;
  font-weight: 600;
  line-height: 1.3;
}

.overlay :deep(.big.primary) {
  background: #6a9fd8;
  color: #fff;
}

.overlay :deep(.big.secondary) {
  background: #d9eafc;
  color: #6a9fd8;
}

.overlay :deep(.big.orange) {
  background: #f28a1e;
  color: #fff;
}

@keyframes fade {
  from {
    opacity: 0;
  }
}

@keyframes drop {
  from {
    transform: translateY(-6cqw) scale(0.6);
    opacity: 0;
  }
}

@keyframes spin {
  to {
    rotate: 360deg;
  }
}

@keyframes rise {
  from {
    transform: translateY(8cqw);
    opacity: 0;
  }
}
</style>
