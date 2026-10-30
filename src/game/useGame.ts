import { computed, ref } from 'vue'
import { generatePuzzle } from './generator'
import { conflictingCats, isSolutionCell, isSolved } from './rules'
import type { CellIndex, Mark, Puzzle } from './types'

export const MAX_HEARTS = 3

/**
 * Game state for one puzzle. Like Meowdoku, a cat on a wrong cell costs a
 * heart and is not kept; losing every heart ends the level.
 */
export function useGame(size: number, seed: number) {
  const puzzle = ref<Puzzle>(generatePuzzle(size, seed))
  const marks = ref<Mark[]>([])
  const hearts = ref(MAX_HEARTS)
  const history = ref<Mark[][]>([])

  const reset = () => {
    marks.value = new Array<Mark>(puzzle.value.size ** 2).fill('empty')
    hearts.value = MAX_HEARTS
    history.value = []
  }
  reset()

  const solved = computed(() => isSolved(puzzle.value, marks.value))
  const lost = computed(() => hearts.value <= 0)
  const conflicts = computed(() => conflictingCats(puzzle.value, marks.value))

  const setMark = (cell: CellIndex, mark: Mark) => {
    if (solved.value || lost.value || marks.value[cell] === mark) return
    if (mark === 'cat' && !isSolutionCell(puzzle.value, cell)) {
      hearts.value--
      return
    }
    history.value.push([...marks.value])
    marks.value[cell] = mark
  }

  /** Single tap cycles empty → x → cat → empty. */
  const cycle = (cell: CellIndex) => {
    const next: Record<Mark, Mark> = { empty: 'x', x: 'cat', cat: 'empty' }
    setMark(cell, next[marks.value[cell]])
  }

  const undo = () => {
    const previous = history.value.pop()
    if (previous) marks.value = previous
  }

  const newPuzzle = (nextSize: number, nextSeed: number) => {
    puzzle.value = generatePuzzle(nextSize, nextSeed)
    reset()
  }

  return { puzzle, marks, hearts, solved, lost, conflicts, setMark, cycle, undo, reset, newPuzzle }
}
