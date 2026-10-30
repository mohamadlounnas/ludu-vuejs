import { computed, ref, shallowRef } from 'vue'
import { impossibleCells } from './hints'
import { blockedBy, isSolutionCell, isSolved } from './rules'
import type { CellIndex, Mark, Puzzle } from './types'

export const MAX_FISH = 3
export const DOUBLE_TAP_MS = 320

export type Status = 'playing' | 'won' | 'lost'

/**
 * Board state for one level, following Meowdoku's controls: tap toggles an
 * X, double-tap places a cat, dragging paints the first tap's mark across
 * cells. A cat on a wrong cell costs a fish (life) and leaves an X; a
 * correct cat crosses out every cell it rules out.
 */
export function useGame(initial: Puzzle) {
  const puzzle = shallowRef(initial)
  const marks = ref<Mark[]>([])
  const fish = ref(MAX_FISH)
  const shaking = ref<CellIndex | null>(null)

  let lastTap = { cell: -1, time: 0 }
  let paintMark: Mark | null = null

  const load = (next: Puzzle) => {
    puzzle.value = next
    marks.value = new Array<Mark>(next.size ** 2).fill('empty')
    fish.value = MAX_FISH
    shaking.value = null
    lastTap = { cell: -1, time: 0 }
  }
  load(initial)

  const status = computed<Status>(() =>
    fish.value <= 0 ? 'lost' : isSolved(puzzle.value, marks.value) ? 'won' : 'playing',
  )

  const catRegions = computed(
    () => new Set(marks.value.flatMap((m, i) => (m === 'cat' ? [puzzle.value.regions[i]] : []))),
  )

  const placeCat = (cell: CellIndex) => {
    marks.value[cell] = 'cat'
    for (const other of blockedBy(puzzle.value, cell)) {
      if (marks.value[other] === 'empty') marks.value[other] = 'x'
    }
  }

  const tryCat = (cell: CellIndex) => {
    if (isSolutionCell(puzzle.value, cell)) {
      placeCat(cell)
      return
    }
    fish.value--
    marks.value[cell] = 'x'
    shaking.value = cell
    setTimeout(() => shaking.value === cell && (shaking.value = null), 500)
  }

  const press = (cell: CellIndex, now = Date.now()) => {
    if (status.value !== 'playing') return
    const double = lastTap.cell === cell && now - lastTap.time < DOUBLE_TAP_MS
    lastTap = { cell, time: double ? 0 : now }
    paintMark = null
    if (marks.value[cell] === 'cat') return
    if (double) {
      tryCat(cell)
      return
    }
    paintMark = marks.value[cell] === 'empty' ? 'x' : 'empty'
    marks.value[cell] = paintMark
  }

  const drag = (cell: CellIndex) => {
    if (status.value === 'playing' && paintMark && marks.value[cell] !== 'cat') marks.value[cell] = paintMark
  }

  /** Cat power-up: places the cat of the most constrained unsolved region. */
  const revealCat = (): boolean => {
    if (status.value !== 'playing') return false
    const { size, regions, solution } = puzzle.value
    const openCells = (region: number) =>
      regions.filter((r, i) => r === region && marks.value[i] === 'empty').length
    const target = solution
      .map((col, row) => row * size + col)
      .filter((cell) => marks.value[cell] !== 'cat')
      .sort((a, b) => openCells(regions[a]) - openCells(regions[b]))[0]
    if (target === undefined) return false
    placeCat(target)
    return true
  }

  /** Bulb power-up: crosses out cells ruled out by deduction, or one wrong cell as a fallback. */
  const hint = (): boolean => {
    if (status.value !== 'playing') return false
    let cells = impossibleCells(puzzle.value, marks.value)
    if (cells.length === 0) {
      const fallback = marks.value.findIndex((m, i) => m === 'empty' && !isSolutionCell(puzzle.value, i))
      cells = fallback === -1 ? [] : [fallback]
    }
    for (const cell of cells) marks.value[cell] = 'x'
    return cells.length > 0
  }

  /** Mouse power-up: removes X marks wrongly placed on cells that hold a cat. */
  const clearMistakes = (): boolean => {
    if (status.value !== 'playing') return false
    let cleared = false
    marks.value.forEach((m, i) => {
      if (m === 'x' && isSolutionCell(puzzle.value, i)) {
        marks.value[i] = 'empty'
        cleared = true
      }
    })
    return cleared
  }

  return { puzzle, marks, fish, shaking, status, catRegions, load, press, drag, revealCat, hint, clearMistakes }
}
