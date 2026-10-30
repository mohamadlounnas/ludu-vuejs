<script setup lang="ts">
import { ref } from 'vue'
import GameBoard from './components/GameBoard.vue'
import { MAX_SIZE, MIN_SIZE } from './game/generator'
import { dailySeed } from './game/rng'
import { MAX_HEARTS, useGame } from './game/useGame'

const size = ref(6)
const { puzzle, marks, hearts, solved, lost, conflicts, cycle, undo, reset, newPuzzle } = useGame(
  size.value,
  dailySeed(new Date()),
)

const randomPuzzle = () => newPuzzle(size.value, Math.floor(Math.random() * 2 ** 31))
</script>

<template>
  <main>
    <h1>Cat Grid</h1>
    <p class="rules">One cat per row, column and color. Cats never touch, not even diagonally.</p>

    <div class="hearts" :aria-label="`${hearts} hearts left`">
      <span v-for="i in MAX_HEARTS" :key="i">{{ i <= hearts ? '❤️' : '🤍' }}</span>
    </div>

    <GameBoard :puzzle="puzzle" :marks="marks" :conflicts="conflicts" @tap="cycle" />

    <p v-if="solved" class="status">Purr-fect! Puzzle solved.</p>
    <p v-else-if="lost" class="status">Out of hearts. Try again!</p>

    <div class="controls">
      <button @click="undo">Undo</button>
      <button @click="reset">Restart</button>
      <label>
        Size
        <select v-model.number="size">
          <option v-for="n in MAX_SIZE - MIN_SIZE + 1" :key="n" :value="n + MIN_SIZE - 1">
            {{ n + MIN_SIZE - 1 }}×{{ n + MIN_SIZE - 1 }}
          </option>
        </select>
      </label>
      <button @click="randomPuzzle">New puzzle</button>
    </div>
  </main>
</template>

<style scoped>
main {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 16px;
}

h1 {
  margin: 8px 0 0;
}

.rules {
  margin: 0;
  color: var(--muted);
  text-align: center;
}

.hearts {
  font-size: 24px;
  letter-spacing: 4px;
}

.status {
  font-weight: 600;
  margin: 0;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: center;
}
</style>
