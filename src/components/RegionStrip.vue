<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { tf } from '../i18n'
import { INKS, pastel, REGION_COLORS, regionPattern } from '../game/palette'
import CatFace from './icons/CatFace.vue'
import CatSilhouette, { SILHOUETTE_MASK } from './icons/CatSilhouette.vue'

/**
 * One head per region: a pastel silhouette until its cat is found. Regions
 * holding a test cat of the focus ink show a faded head over that ink.
 * The heads drop in one by one with each new board, and hop off as it leaves.
 *
 * Each head is a button: tapping it spotlights its region on the board
 * (`spot`) and a bubble over it counts the region's open cells (`open`).
 * A newly found cat flies up from its cell (FxLayer): its head pops as it
 * lands, unless `calm`.
 */
const props = defineProps<{
  size: number
  found: Set<number>
  ghosts: Map<number, number>
  /** Open cells per region, as the board shows them (pen + focus layer). */
  open: number[]
  leaving?: boolean
  patterns?: boolean
  calm?: boolean
}>()

const emit = defineEmits<{ spot: [region: number] }>()

/** The flying cat lands on its head this long after it leaves its cell (FxLayer's TOKEN_MS). */
const LAND_MS = 440

/** Heads whose cat is still on its way: the silhouette waits for it. */
const arriving = ref(new Set<number>())
const timers: number[] = []
watch(
  () => props.found,
  (now, before) => {
    if (props.calm) return
    const fresh = [...now].filter((r) => !before.has(r))
    if (fresh.length === 0) return
    arriving.value = new Set([...arriving.value, ...fresh])
    timers.push(
      window.setTimeout(() => (arriving.value = new Set([...arriving.value].filter((r) => !fresh.includes(r)))), LAND_MS + 450),
    )
  },
)

/** The open-cell bubble over a tapped head. */
const bubble = ref<{ region: number; id: number } | null>(null)
let bubbleId = 0
const BUBBLE_MS = 1200
const onSpot = (region: number) => {
  const id = ++bubbleId
  bubble.value = { region, id }
  timers.push(window.setTimeout(() => bubble.value?.id === id && (bubble.value = null), BUBBLE_MS))
  emit('spot', region)
}
onBeforeUnmount(() => timers.forEach(clearTimeout))

/** A silhouette with its region's pattern, drawn in the region's own colour (so it reads on the pastel). */
const patterned = (region: number) => ({
  background: `${regionPattern(region, REGION_COLORS[region], 0.6)} 0 0 / 2.8cqw 2.8cqw, ${pastel(REGION_COLORS[region])}`,
  mask: `${SILHOUETTE_MASK} center / contain no-repeat`,
})
</script>

<template>
  <div class="strip" :class="{ leaving }" dir="ltr">
    <button
      v-for="region in size"
      :key="region"
      type="button"
      class="seat"
      :class="{ arrive: arriving.has(region - 1) }"
      :data-region="region - 1"
      :style="{ '--i': region - 1, '--n': size }"
      :aria-label="tf('regionOpen', { n: region, k: open[region - 1] ?? 0 })"
      @click="onSpot(region - 1)"
    >
      <template v-if="found.has(region - 1)">
        <CatSilhouette v-if="arriving.has(region - 1)" class="head stand-in" :color="pastel(REGION_COLORS[region - 1])" />
        <CatFace class="head found" />
      </template>
      <span v-else-if="ghosts.has(region - 1)" class="head ghost" :style="{ '--ink': INKS[ghosts.get(region - 1)!].color }">
        <CatFace />
      </span>
      <span v-else-if="patterns && region > 1" class="head" :style="patterned(region - 1)" />
      <CatSilhouette v-else class="head" :color="pastel(REGION_COLORS[region - 1])" />
      <Transition name="bubble">
        <span v-if="bubble?.region === region - 1" :key="bubble.id" class="bubble" aria-hidden="true">
          {{ open[region - 1] ?? 0 }}
        </span>
      </Transition>
    </button>
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
  position: relative;
  display: grid;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
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
  grid-area: 1 / 1;
  width: 5.6cqw;
  height: 6cqw;
}

.seat:focus-visible {
  outline: 0.5cqw solid var(--text);
  outline-offset: 0.3cqw;
  border-radius: 1.4cqw;
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

/*
 * A cat flying in from the board: the silhouette holds its seat until the
 * cat lands, then the head takes over, squashed by the impact, springs back
 * and a white ring pings out of the seat.
 */
.arrive .found {
  transform-origin: 50% 90%;
  animation: land-pop 0.4s 440ms backwards;
}

.arrive .stand-in {
  animation: hide 1ms 440ms forwards;
}

.arrive::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 55%;
  width: 5cqw;
  height: 5cqw;
  margin: -2.5cqw 0 0 -2.5cqw;
  border-radius: 50%;
  pointer-events: none;
  animation: ping 400ms ease-out 440ms backwards;
}

@keyframes land-pop {
  0% {
    transform: scale(1.2, 0.78);
    opacity: 0;
    animation-timing-function: cubic-bezier(0.2, 0.8, 0.3, 1);
  }
  1% {
    opacity: 1;
  }
  45% {
    transform: scale(0.94, 1.08);
    animation-timing-function: cubic-bezier(0.45, 0, 0.55, 1);
  }
  75% {
    transform: scale(1.03, 0.98);
  }
  100% {
    transform: none;
  }
}

@keyframes hide {
  to {
    visibility: hidden;
  }
}

@keyframes ping {
  from {
    box-shadow: 0 0 0 0 rgb(255 255 255 / 0.95);
  }
  to {
    box-shadow: 0 0 0 1.6cqw rgb(255 255 255 / 0);
  }
}

/* Open cells: a little count bubble pops up over the tapped head. */
.bubble {
  position: absolute;
  z-index: 7;
  bottom: calc(100% + 1.2cqw);
  left: 50%;
  translate: -50% 0;
  min-width: 3.2cqw;
  padding: 0.5cqw 1.3cqw;
  border-radius: 999px;
  background: var(--text);
  color: #fff;
  font-size: 3.2cqw;
  font-weight: 700;
  line-height: 1.1;
  pointer-events: none;
  transform-origin: 50% 120%;
  box-shadow: 0 0.5cqw 1.2cqw rgb(120 70 60 / 0.3);
}

/* Its tail points down at the head. */
.bubble::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -0.7cqw;
  width: 1.6cqw;
  height: 1.6cqw;
  margin-left: -0.8cqw;
  border-radius: 0 0 0.3cqw 0;
  background: inherit;
  transform: rotate(45deg);
}

.bubble-enter-active {
  animation: bubble-pop 260ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.bubble-leave-active {
  transition:
    opacity 160ms ease-in,
    transform 160ms ease-in;
}

.bubble-leave-to {
  opacity: 0;
  transform: translateY(-0.8cqw) scale(0.9);
}

@keyframes bubble-pop {
  from {
    transform: translateY(1.2cqw) scale(0);
    opacity: 0;
  }
  40% {
    opacity: 1;
  }
}
</style>
