import { computed, ref, shallowRef } from 'vue'
import { impossibleCells } from './hints'
import { blockedBy, isSolutionCell, isSolved } from './rules'
import type { CellIndex, Mark, Puzzle } from './types'

export const MAX_FISH = 3
export const DOUBLE_TAP_MS = 320
/** Time between two X marks of the auto-cross wave. */
export const WAVE_STEP_MS = 70
export const MISTAKE_MS = 1100

export type Status = 'playing' | 'won' | 'lost'

/** A correct cat: what the board animates around it. */
export interface Placement {
  id: number
  cell: CellIndex
  points: number
  /** Auto-crossed cells and when (ms) their X starts drawing. */
  delays: Map<CellIndex, number>
  /** Line ends that get a "Clear!" label once the wave reaches them. */
  clears: { cell: CellIndex; delay: number }[]
}

/** Points for a cat: bigger boards pay more, and quick cats pay most. */
export function catPoints(size: number, elapsedMs: number): number {
  const speed = Math.min(1, Math.max(0.25, 1 - elapsedMs / 100_000))
  return Math.round(size * size * 6 * speed)
}

/**
 * Orders the cells a new cat rules out the way the original animates them:
 * the touching cells first, then the row and the column sweeping outward
 * from the cat, then whatever is left of its region.
 */
function crossWave(puzzle: Puzzle, cat: CellIndex, marks: Mark[]): Pick<Placement, 'delays' | 'clears'> {
  const { size, regions } = puzzle
  const row = Math.floor(cat / size)
  const col = cat % size
  const rowOf = (c: CellIndex) => Math.floor(c / size)
  const colOf = (c: CellIndex) => c % size
  const open = blockedBy(puzzle, cat).filter((c) => marks[c] === 'empty')

  const neighbours = open.filter((c) => Math.abs(rowOf(c) - row) <= 1 && Math.abs(colOf(c) - col) <= 1)
  const line = (inLine: (c: CellIndex) => boolean, dist: (c: CellIndex) => number) =>
    open.filter((c) => inLine(c) && !neighbours.includes(c)).sort((a, b) => dist(a) - dist(b))
  const rowCells = line((c) => rowOf(c) === row, (c) => Math.abs(colOf(c) - col))
  const colCells = line((c) => colOf(c) === col, (c) => Math.abs(rowOf(c) - row))
  const regionCells = open.filter(
    (c) => regions[c] === regions[cat] && rowOf(c) !== row && colOf(c) !== col && !neighbours.includes(c),
  )

  const delays = new Map<CellIndex, number>()
  const clears: Placement['clears'] = []
  let t = 0
  for (const phase of [neighbours, rowCells, colCells, regionCells]) {
    phase.forEach((c, i) => delays.set(c, t + i * WAVE_STEP_MS))
    if (phase.length > 0) t += (phase.length + 1) * WAVE_STEP_MS
  }
  // "Clear!" pops on the far end of the row and of the column.
  for (const cells of [rowCells, colCells]) {
    const last = cells.at(-1)
    if (last !== undefined) clears.push({ cell: last, delay: delays.get(last)! + 200 })
  }
  return { delays, clears }
}

/**
 * Board state for one puzzle, following Meowdoku's controls: tap toggles an
 * X, double-tap places a cat, dragging paints the first tap's mark across
 * cells. A cat on a wrong cell costs a fish and leaves a red X; a correct
 * cat scores points and crosses out every cell it rules out.
 */
export function useGame(initial: Puzzle) {
  const puzzle = shallowRef(initial)
  const marks = ref<Mark[]>([])
  const mistakes = ref(new Set<CellIndex>())
  const fish = ref(MAX_FISH)
  const score = ref(0)
  const continued = ref(false)
  const mistakeCell = ref<CellIndex | null>(null)
  const placement = shallowRef<Placement | null>(null)
  /** Changes on every (re)start, so views can replay their intro animations. */
  const round = ref(0)

  let startedAt = Date.now()
  let lastTap = { cell: -1, time: 0 }
  let paintMark: Mark | null = null

  const load = (next: Puzzle) => {
    puzzle.value = next
    marks.value = new Array<Mark>(next.size ** 2).fill('empty')
    mistakes.value = new Set()
    fish.value = MAX_FISH
    score.value = 0
    continued.value = false
    mistakeCell.value = null
    placement.value = null
    round.value++
    startedAt = Date.now()
    lastTap = { cell: -1, time: 0 }
  }
  load(initial)

  const status = computed<Status>(() =>
    fish.value <= 0 ? 'lost' : isSolved(puzzle.value, marks.value) ? 'won' : 'playing',
  )

  const catRegions = computed(
    () => new Set(marks.value.flatMap((m, i) => (m === 'cat' ? [puzzle.value.regions[i]] : []))),
  )

  const catsLeft = computed(() => puzzle.value.size - marks.value.filter((m) => m === 'cat').length)

  const placeCat = (cell: CellIndex, points: number) => {
    const wave = crossWave(puzzle.value, cell, marks.value)
    marks.value[cell] = 'cat'
    for (const c of wave.delays.keys()) marks.value[c] = 'x'
    score.value += points
    placement.value = { id: Date.now() + Math.random(), cell, points, ...wave }
  }

  const tryCat = (cell: CellIndex, now: number) => {
    if (isSolutionCell(puzzle.value, cell)) {
      placeCat(cell, catPoints(puzzle.value.size, now - startedAt))
      return
    }
    fish.value--
    marks.value[cell] = 'x'
    mistakes.value.add(cell)
    mistakeCell.value = cell
    setTimeout(() => mistakeCell.value === cell && (mistakeCell.value = null), MISTAKE_MS)
  }

  const press = (cell: CellIndex, now = Date.now()) => {
    if (status.value !== 'playing') return
    const double = lastTap.cell === cell && now - lastTap.time < DOUBLE_TAP_MS
    lastTap = { cell, time: double ? 0 : now }
    paintMark = null
    if (marks.value[cell] === 'cat') return
    if (double) {
      tryCat(cell, now)
      return
    }
    paintMark = marks.value[cell] === 'empty' ? 'x' : 'empty'
    setMark(cell, paintMark)
  }

  const setMark = (cell: CellIndex, mark: Mark) => {
    marks.value[cell] = mark
    if (mark === 'empty') mistakes.value.delete(cell)
  }

  const drag = (cell: CellIndex) => {
    if (status.value === 'playing' && paintMark && marks.value[cell] !== 'cat') setMark(cell, paintMark)
  }

  /** Cat power-up: places the cat of the most constrained unsolved region (no points). */
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
    placeCat(target, 0)
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

  /** "Get 3 fish" on the game-over screen: one refill per attempt. */
  const continueWithFish = (): boolean => {
    if (status.value !== 'lost' || continued.value) return false
    continued.value = true
    fish.value = MAX_FISH
    return true
  }

  return {
    puzzle,
    marks,
    mistakes,
    fish,
    score,
    continued,
    mistakeCell,
    placement,
    round,
    status,
    catRegions,
    catsLeft,
    load,
    press,
    drag,
    revealCat,
    hint,
    clearMistakes,
    continueWithFish,
  }
}
