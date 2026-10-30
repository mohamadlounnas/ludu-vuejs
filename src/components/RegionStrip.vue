<script setup lang="ts">
import { INKS, pastel, REGION_COLORS } from '../game/palette'
import CatFace from './icons/CatFace.vue'
import CatSilhouette from './icons/CatSilhouette.vue'

/**
 * One head per region: a pastel silhouette until its cat is found. Regions
 * holding a test cat of the focus ink show a faded head over that ink.
 * The heads drop in one by one with each new board, and hop off as it leaves.
 */
defineProps<{ size: number; found: Set<number>; ghosts: Map<number, number>; leaving?: boolean }>()
</script>

<template>
  <div class="strip" :class="{ leaving }" dir="ltr">
    <span v-for="region in size" :key="region" class="seat" :style="{ '--i': region - 1, '--n': size }">
      <CatFace v-if="found.has(region - 1)" class="head found" />
      <span v-else-if="ghosts.has(region - 1)" class="head ghost" :style="{ '--ink': INKS[ghosts.get(region - 1)!].color }">
        <CatFace />
      </span>
      <CatSilhouette v-else class="head" :color="pastel(REGION_COLORS[region - 1])" />
    </span>
  </div>
</template>

<style scoped>
.strip {
  position: relative;
  display: flex;
  justify-content: center;
  gap: 0.9cqw;
  margin: 0 auto;
  width: fit-content;
  padding: 1.2cqw 3cqw 0.4cqw;
  background: var(--card);
  border-radius: 3.2cqw 3.2cqw 0 0;
}

/* Concave corners where the tab meets the board. */
.strip::before,
.strip::after {
  content: '';
  position: absolute;
  bottom: 0;
  width: 3.2cqw;
  height: 3.2cqw;
}

.strip::before {
  right: 100%;
  background: radial-gradient(circle at 0 0, transparent 3.2cqw, var(--card) 3.25cqw);
}

.strip::after {
  left: 100%;
  background: radial-gradient(circle at 100% 0, transparent 3.2cqw, var(--card) 3.25cqw);
}

/* Each head sits on its own seat, which drops in once per board (heads swap inside it). */
.seat {
  display: grid;
  transform-origin: 50% 100%;
  animation: drop-in 0.42s calc(var(--i) * 35ms) backwards;
}

/* Falls, squashes as it lands, rebounds a little and settles. */
@keyframes drop-in {
  0% {
    transform: translateY(-4cqw);
    opacity: 0;
    animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45);
  }
  20% {
    opacity: 1;
  }
  50% {
    transform: translateY(0) scale(1.14, 0.82);
    animation-timing-function: cubic-bezier(0.2, 0.8, 0.3, 1);
  }
  72% {
    transform: translateY(-0.7cqw) scale(0.96, 1.05);
    animation-timing-function: cubic-bezier(0.5, 0, 0.6, 1);
  }
  100% {
    transform: none;
  }
}

/* Next board: they crouch and hop off, last one first. */
.strip.leaving .seat {
  animation: hop-off 0.2s calc((var(--n) - 1 - var(--i)) * 10ms) ease-in-out forwards;
}

@keyframes hop-off {
  30% {
    transform: translateY(0.3cqw) scale(1.08, 0.9);
    animation-timing-function: cubic-bezier(0.2, 0.7, 0.4, 1);
  }
  to {
    transform: translateY(-3cqw) scale(0.9, 1.08);
    opacity: 0;
  }
}

.head {
  width: 5.6cqw;
  height: 6cqw;
}

.ghost {
  display: grid;
  border-radius: 50%;
  box-shadow: 0 0.5cqw 0 -0.1cqw var(--ink);
}

.ghost svg {
  opacity: 0.5;
}

.found {
  animation: pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes pop {
  from {
    transform: scale(0.2);
  }
}
</style>
