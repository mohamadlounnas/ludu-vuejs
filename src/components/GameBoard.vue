<script setup lang="ts">
import type { Mark, Puzzle } from '../game/types'

defineProps<{
  puzzle: Puzzle
  marks: Mark[]
  conflicts: Set<number>
}>()

const emit = defineEmits<{ tap: [cell: number] }>()

// Pastel palette, one color per region (max board size is 11).
const REGION_COLORS = [
  '#f7b2a4', '#f9d59b', '#c8e6a0', '#a8dcd1', '#a9c8f0', '#c9b6ef',
  '#f2b3d6', '#e4d3b8', '#b8e0f0', '#d9e89a', '#f0c2a0',
]
</script>

<template>
  <div class="board" :style="{ gridTemplateColumns: `repeat(${puzzle.size}, 1fr)` }">
    <button
      v-for="(region, cell) in puzzle.regions"
      :key="cell"
      class="cell"
      :class="{ conflict: conflicts.has(cell) }"
      :style="{ background: REGION_COLORS[region] }"
      :aria-label="`Row ${Math.floor(cell / puzzle.size) + 1}, column ${(cell % puzzle.size) + 1}: ${marks[cell]}`"
      @click="emit('tap', cell)"
    >
      <span v-if="marks[cell] === 'cat'">🐱</span>
      <span v-else-if="marks[cell] === 'x'" class="x">×</span>
    </button>
  </div>
</template>

<style scoped>
.board {
  display: grid;
  width: min(92vw, 480px);
  aspect-ratio: 1;
  border: 3px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.cell {
  border: 1px solid rgb(0 0 0 / 0.15);
  padding: 0;
  display: grid;
  place-items: center;
  font-size: clamp(14px, 5vw, 28px);
}

.x {
  color: var(--muted);
}

.conflict {
  outline: 3px solid var(--heart);
  outline-offset: -3px;
}
</style>
