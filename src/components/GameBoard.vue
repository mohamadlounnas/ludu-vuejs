<script setup lang="ts">
import { REGION_COLORS } from '../game/palette'
import type { Mark, Puzzle } from '../game/types'
import CatFace from './icons/CatFace.vue'
import XMark from './icons/XMark.vue'

defineProps<{
  puzzle: Puzzle
  marks: Mark[]
  shaking: number | null
}>()

const emit = defineEmits<{ press: [cell: number]; drag: [cell: number] }>()

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
  emit('press', cell)
}

const onMove = (e: PointerEvent) => {
  if (!dragging) return
  const cell = cellAt(e)
  if (cell === null || cell === lastCell) return
  lastCell = cell
  emit('drag', cell)
}

const onUp = () => (dragging = false)
</script>

<template>
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
      :class="{ shake: shaking === cell }"
      :style="{ background: REGION_COLORS[region] }"
      role="button"
      :aria-label="`${Math.floor(cell / puzzle.size) + 1}, ${(cell % puzzle.size) + 1}: ${marks[cell]}`"
    >
      <CatFace v-if="marks[cell] === 'cat'" class="cat" />
      <XMark v-else-if="marks[cell] === 'x'" class="x" />
    </div>
  </div>
</template>

<style scoped>
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
  aspect-ratio: 1;
  border-radius: 0.7cqw;
  display: grid;
  place-items: center;
  cursor: pointer;
  overflow: hidden;
}

.x {
  width: 100%;
  color: #fff;
  animation: pop 0.15s ease-out;
}

.cat {
  width: 82%;
  margin-top: 6%;
  animation: pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.shake {
  animation: shake 0.45s ease-in-out;
  box-shadow: inset 0 0 0 0.6cqw var(--danger);
}

@keyframes pop {
  from {
    transform: scale(0.3);
    opacity: 0;
  }
}

@keyframes shake {
  20%,
  60% {
    transform: translateX(-0.8cqw);
  }
  40%,
  80% {
    transform: translateX(0.8cqw);
  }
}
</style>
