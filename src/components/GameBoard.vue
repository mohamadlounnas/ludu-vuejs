<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { REGION_COLORS } from '../game/palette'
import type { Mark, Puzzle } from '../game/types'
import type { Hint, Placement } from '../game/useGame'
import BrokenHeart from './icons/BrokenHeart.vue'
import CatFace from './icons/CatFace.vue'
import XMark from './icons/XMark.vue'

const props = defineProps<{
  puzzle: Puzzle
  marks: Mark[]
  mistakes: Set<number>
  mistakeCell: number | null
  placement: Placement | null
  hinted: Hint | null
}>()

const emit = defineEmits<{ press: [cell: number]; drag: [cell: number] }>()

// ---- Pointer input: tap, double-tap and drag-to-paint ----

let dragging = false
let lastCell = -1

// Pointer capture keeps events on the board, so find the cell under the finger.
const cellAt = (e: PointerEvent): number | null => {
  const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-cell]')
  return el ? Number(el.dataset.cell) : null
}

const onDown = (e: PointerEvent) => {
  const cell = cellAt(e)
  if (cell === null) return
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  dragging = true
  lastCell = cell
  delays.delete(cell)
  emit('press', cell)
}

const onMove = (e: PointerEvent) => {
  if (!dragging) return
  const cell = cellAt(e)
  if (cell === null || cell === lastCell) return
  lastCell = cell
  delays.delete(cell)
  emit('drag', cell)
}

const onUp = () => (dragging = false)

// ---- Effects: auto-cross wave, "+points", "Clear!" and a burst ----

interface Effect {
  id: number
  cell: number
  kind: 'points' | 'clear' | 'burst'
  text?: string
  delay: number
}

/** X marks still waiting for the wave to reach them. */
const delays = new Map<number, number>()
const effects = ref<Effect[]>([])
const timers: number[] = []
let nextId = 0

watch(
  () => props.placement,
  (p) => {
    if (!p) return
    for (const [cell, delay] of p.delays) delays.set(cell, delay)
    const add: Effect[] = [
      { id: nextId++, cell: p.cell, kind: 'burst', delay: 0 },
      { id: nextId++, cell: p.cell, kind: 'clear', delay: 60 },
      ...p.clears.map((c) => ({ id: nextId++, cell: c.cell, kind: 'clear' as const, delay: c.delay })),
    ]
    if (p.points > 0) add.push({ id: nextId++, cell: p.cell, kind: 'points', text: `+${p.points}`, delay: 0 })
    effects.value.push(...add)
    const longest = Math.max(...add.map((e) => e.delay)) + 1200
    timers.push(
      window.setTimeout(() => {
        const done = new Set(add.map((e) => e.id))
        effects.value = effects.value.filter((e) => !done.has(e.id))
        for (const cell of p.delays.keys()) delays.delete(cell)
      }, longest),
    )
  },
)

watch(
  () => props.puzzle,
  () => {
    delays.clear()
    effects.value = []
  },
)

onBeforeUnmount(() => timers.forEach(clearTimeout))

const at = (cell: number) => ({
  left: `${(((cell % props.puzzle.size) + 0.5) / props.puzzle.size) * 100}%`,
  top: `${((Math.floor(cell / props.puzzle.size) + 0.5) / props.puzzle.size) * 100}%`,
})

/** Intro: cells pop in along diagonals starting from the bottom-left corner. */
const introDelay = (cell: number) => {
  const { size } = props.puzzle
  return `${(size - 1 - Math.floor(cell / size) + (cell % size)) * 28}ms`
}

const BURST_COLORS = ['#f7a8c4', '#9fd0f5', '#ffd25a', '#b6d899', '#c9b6ef', '#f1ac6f']
</script>

<template>
  <div class="board-box">
    <div
      class="board"
      dir="ltr"
      :style="{ gridTemplateColumns: `repeat(${puzzle.size}, 1fr)` }"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    >
      <div
        v-for="(region, cell) in puzzle.regions"
        :key="cell"
        :data-cell="cell"
        class="cell"
        :class="{ 'hint-target': hinted?.target.includes(cell), 'hint-reason': hinted?.reason.includes(cell) }"
        :style="{ background: REGION_COLORS[region], animationDelay: introDelay(cell) }"
        role="button"
        :aria-label="`${Math.floor(cell / puzzle.size) + 1}, ${(cell % puzzle.size) + 1}: ${marks[cell]}`"
      >
        <CatFace v-if="marks[cell] === 'cat'" class="cat" :mood="mistakeCell !== null ? 'worried' : 'happy'" />
        <XMark v-else-if="marks[cell] === 'x'" class="x" :class="{ wrong: mistakes.has(cell) }" :delay="delays.get(cell) ?? 0" />
        <div v-if="mistakeCell === cell" class="oops">
          <XMark class="oops-x" :animate="false" />
          <BrokenHeart class="oops-heart" />
        </div>
      </div>
    </div>

    <div class="fx" dir="ltr" aria-hidden="true">
      <template v-for="e in effects" :key="e.id">
        <span v-if="e.kind === 'points'" class="points" :style="{ ...at(e.cell), animationDelay: `${e.delay}ms` }">
          {{ e.text }}
        </span>
        <span v-else-if="e.kind === 'clear'" class="clear" :style="{ ...at(e.cell), animationDelay: `${e.delay}ms` }">
          Clear!
        </span>
        <span v-else class="burst" :style="at(e.cell)">
          <i
            v-for="n in 10"
            :key="n"
            :style="{ '--a': `${n * 36}deg`, '--c': BURST_COLORS[n % BURST_COLORS.length] }"
          />
        </span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.board-box {
  position: relative;
}

.board {
  display: grid;
  gap: 0.8cqw;
  padding: 1.7cqw;
  background: var(--card);
  border-radius: 2.4cqw;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.cell {
  position: relative;
  aspect-ratio: 1;
  border-radius: 1.15cqw;
  display: grid;
  place-items: center;
  cursor: pointer;
  overflow: hidden;
  animation: cell-in 0.35s cubic-bezier(0.34, 1.4, 0.64, 1) backwards;
}

.x {
  width: 100%;
  color: #fff;
}

.x.wrong {
  color: #ec4b33;
}

.cat {
  width: 82%;
  margin-top: 6%;
  animation: pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* Pressed cells light up briefly, as in the original. */
.cell:active {
  filter: brightness(1.15);
}

/* Bulb hint: the proving group glows, the cells it decides pulse. */
.hint-reason::after,
.hint-target::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
}

.hint-reason::after {
  box-shadow: inset 0 0 0 0.6cqw rgb(255 255 255 / 0.9);
  animation: hint-glow 1.1s ease-in-out infinite alternate;
}

.hint-target::after {
  box-shadow: inset 0 0 0 0.7cqw #ffd23f, 0 0 2cqw #ffd23f;
  animation: hint-pulse 0.6s ease-in-out infinite alternate;
}

@keyframes hint-glow {
  from {
    opacity: 0.35;
  }
}

@keyframes hint-pulse {
  to {
    transform: scale(0.9);
  }
}

/* Wrong cat: orange-red flash with an X, then a heart that breaks. */
.oops {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: #f0613d;
  animation: oops-bg 1.1s ease-in forwards;
}

.oops > * {
  grid-area: 1 / 1;
  width: 72%;
}

.oops-x {
  width: 100%;
  color: #fff;
  animation: hide 0.01s 0.25s forwards;
}

@keyframes oops-bg {
  85% {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

@keyframes hide {
  to {
    visibility: hidden;
  }
}

@keyframes cell-in {
  from {
    transform: scale(0.3);
    opacity: 0;
  }
}

@keyframes pop {
  from {
    transform: scale(0.3);
    opacity: 0;
  }
}

/* Effects layer sits over the grid area (inside the board padding). */
.fx {
  position: absolute;
  inset: 1.7cqw;
  pointer-events: none;
}

.fx > span {
  position: absolute;
  translate: -50% -50%;
}

.points,
.clear {
  font-weight: 800;
  white-space: nowrap;
  paint-order: stroke fill;
  -webkit-text-stroke: 0.9cqw #fff;
}

.points {
  font-size: 5.6cqw;
  color: #f7841e;
  animation: float-up 1.1s ease-out both;
  margin-top: -5cqw;
}

.clear {
  font-size: 5cqw;
  font-style: italic;
  color: #ffd23f;
  -webkit-text-stroke: 0.9cqw #c8741c;
  margin-top: 4cqw;
  animation: clear-pop 1s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.burst i {
  position: absolute;
  width: 1.4cqw;
  height: 1.4cqw;
  border-radius: 50%;
  background: var(--c);
  animation: burst 0.6s ease-out forwards;
}

@keyframes float-up {
  from {
    transform: translateY(3cqw) scale(0.6);
    opacity: 0;
  }
  20% {
    transform: none;
    opacity: 1;
  }
  80% {
    opacity: 1;
  }
  to {
    transform: translateY(-4cqw);
    opacity: 0;
  }
}

@keyframes clear-pop {
  from {
    transform: scale(0);
    opacity: 0;
  }
  25% {
    transform: scale(1.1);
    opacity: 1;
  }
  75% {
    transform: scale(1);
    opacity: 1;
  }
  to {
    transform: scale(1) translateY(-2cqw);
    opacity: 0;
  }
}

@keyframes burst {
  from {
    transform: rotate(var(--a)) translateX(2cqw) scale(1);
  }
  to {
    transform: rotate(var(--a)) translateX(9cqw) scale(0.2);
    opacity: 0;
  }
}
</style>
