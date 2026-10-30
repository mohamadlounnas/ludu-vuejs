<script setup lang="ts">
import { INKS, pastel, REGION_COLORS } from '../game/palette'
import CatFace from './icons/CatFace.vue'
import CatSilhouette from './icons/CatSilhouette.vue'

/** One head per region: a pastel silhouette until its cat is found. */
defineProps<{ size: number; found: Set<number>; ghosts: Map<number, number> }>()
</script>

<template>
  <div class="strip" dir="ltr">
    <template v-for="region in size" :key="region">
      <CatFace v-if="found.has(region - 1)" class="head found" />
      <span v-else-if="ghosts.has(region - 1)" class="head ghost" :style="{ '--ink': INKS[ghosts.get(region - 1)!].color }">
        <CatFace />
      </span>
      <CatSilhouette v-else class="head" :color="pastel(REGION_COLORS[region - 1])" />
    </template>
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
