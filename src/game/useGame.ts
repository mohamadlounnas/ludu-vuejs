import { computed, ref, shallowRef } from 'vue'
import { CAT, nextStep, OPEN, OUT, type CellState } from './logic'
import { blockedBy, conflictingCats, deadGroups, isSolutionCell, isSolved } from './rules'
import type { CellIndex, Mark, Puzzle } from './types'

export const MAX_FISH = 3
export const DOUBLE_TAP_MS = 320
/** Time between two X marks of the auto-cross wave. */
export const WAVE_STEP_MS = 70
export const MISTAKE_MS = 1100
/** Ink 0 is the normal white pen; inks 1..3 are test colours for "what if" reasoning. */
export const INK_COUNT = 4
const HISTORY_LIMIT = 200

export type Status = 'playing' | 'won' | 'lost'

export interface SavedBoard {
  marks: Mark[]
  ink: number[]
  mistakes: CellIndex[]
  fish: number
  score: number
  continued: boolean
  elapsedMs: number
}

/** What the bulb points at: cells to look at (`target`) and the group that proves it (`reason`). */
export interface Hint {
  id: number
  target: CellIndex[]
  reason: CellIndex[]
}

export const HINT_MS = 3200

/** A correct cat: what the board animates around it. */
export interface Placement {
  id: number
  /** A real cat, or a tentative ghost cat placed with a test ink. */
  kind: 'cat' | 'ghost'
  ink: number
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
  /** Ink of each X / ghost (0 = pen). */
  const ink = ref<number[]>([])
  const activeInk = ref(0)
  /** Undo snapshots of marks and inks, back to the last real cat attempt. */
  const history = shallowRef<{ marks: Mark[]; ink: number[] }[]>([])
  const mistakes = ref(new Set<CellIndex>())
  const fish = ref(MAX_FISH)
  const score = ref(0)
  const continued = ref(false)
  const mistakeCell = ref<CellIndex | null>(null)
  const placement = shallowRef<Placement | null>(null)
  const hinted = shallowRef<Hint | null>(null)
  /** Changes on every (re)start, so views can replay their intro animations. */
  const round = ref(0)

  let startedAt = Date.now()
  let lastTap = { cell: -1, time: 0 }
  let paintMark: Mark | null = null
  let paintInk = 0

  const load = (next: Puzzle) => {
    puzzle.value = next
    marks.value = new Array<Mark>(next.size ** 2).fill('empty')
    ink.value = new Array<number>(next.size ** 2).fill(0)
    activeInk.value = 0
    history.value = []
    mistakes.value = new Set()
    fish.value = MAX_FISH
    score.value = 0
    continued.value = false
    mistakeCell.value = null
    placement.value = null
    hinted.value = null
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

  /** Regions holding a ghost cat, with its ink (for the cat-head strip). */
  const ghostRegions = computed(
    () => new Map(marks.value.flatMap((m, i) => (m === 'ghost' ? [[puzzle.value.regions[i], ink.value[i]] as const] : []))),
  )

  /** How many marks each ink has on the board. */
  const inkUse = computed(() => {
    const counts = new Array<number>(INK_COUNT).fill(0)
    marks.value.forEach((m, i) => (m === 'x' || m === 'ghost') && counts[ink.value[i]]++)
    return counts
  })

  /**
   * Broken "what if"s: groups with no room left for a cat, and cats or ghosts
   * that touch / share a line. `inks` are the test inks involved, so the ink
   * bar can point at the culprit.
   */
  const contradictions = computed(() => {
    const dead = deadGroups(puzzle.value, marks.value)
    const clash = [...conflictingCats(puzzle.value, marks.value)]
    const inks = new Set<number>()
    for (const c of [...dead.flat(), ...clash]) if (ink.value[c] > 0) inks.add(ink.value[c])
    return { dead, clash, inks }
  })

  const snapshot = () => {
    history.value = [...history.value.slice(-HISTORY_LIMIT + 1), { marks: [...marks.value], ink: [...ink.value] }]
  }

  const setMark = (cell: CellIndex, mark: Mark, inkIndex = 0) => {
    marks.value[cell] = mark
    ink.value[cell] = mark === 'empty' ? 0 : inkIndex
    if (mark === 'empty') mistakes.value.delete(cell)
  }

  const announce = (kind: Placement['kind'], cell: CellIndex, inkIndex: number, points: number) => {
    const wave = crossWave(puzzle.value, cell, marks.value)
    marks.value[cell] = kind
    ink.value[cell] = inkIndex
    for (const c of wave.delays.keys()) setMark(c, 'x', inkIndex)
    placement.value = { id: Date.now() + Math.random(), kind, ink: inkIndex, cell, points, ...wave }
  }

  /** A real cat: proven, so test marks around it become plain pen marks. */
  const placeCat = (cell: CellIndex, points: number) => {
    announce('cat', cell, 0, points)
    for (const c of blockedBy(puzzle.value, cell)) {
      if (marks.value[c] !== 'empty') setMark(c, 'x', 0)
    }
    score.value += points
    history.value = []
  }

  /** A ghost cat: crosses out what it would rule out, in its own ink. */
  const placeGhost = (cell: CellIndex, inkIndex: number) => {
    announce('ghost', cell, inkIndex, 0)
  }

  const tryCat = (cell: CellIndex, now: number) => {
    if (isSolutionCell(puzzle.value, cell)) {
      placeCat(cell, catPoints(puzzle.value.size, now - startedAt))
      return
    }
    fish.value--
    setMark(cell, 'x', 0)
    history.value = []
    mistakes.value.add(cell)
    mistakeCell.value = cell
    setTimeout(() => mistakeCell.value === cell && (mistakeCell.value = null), MISTAKE_MS)
  }

  const press = (cell: CellIndex, now = Date.now()) => {
    if (status.value !== 'playing') return
    const double = lastTap.cell === cell && now - lastTap.time < DOUBLE_TAP_MS
    lastTap = { cell, time: double ? 0 : now }
    paintMark = null
    const mark = marks.value[cell]
    if (mark === 'cat') return
    if (double) {
      // The first tap of the pair already saved an undo snapshot.
      if (activeInk.value === 0) tryCat(cell, now)
      else placeGhost(cell, activeInk.value)
      return
    }
    snapshot()
    if (mark === 'ghost') {
      setMark(cell, 'empty')
      return
    }
    paintMark = mark === 'empty' ? 'x' : 'empty'
    paintInk = activeInk.value
    setMark(cell, paintMark, paintInk)
  }

  const drag = (cell: CellIndex) => {
    const mark = marks.value[cell]
    if (status.value !== 'playing' || !paintMark || mark === 'cat' || mark === 'ghost') return
    setMark(cell, paintMark, paintInk)
  }

  const setInk = (inkIndex: number) => {
    activeInk.value = Math.max(0, Math.min(INK_COUNT - 1, inkIndex))
  }

  /** Removes every X and ghost drawn with `inkIndex`. */
  const eraseInk = (inkIndex: number): boolean => {
    if (status.value !== 'playing' || inkUse.value[inkIndex] === 0) return false
    snapshot()
    marks.value.forEach((m, i) => {
      if ((m === 'x' || m === 'ghost') && ink.value[i] === inkIndex && !mistakes.value.has(i)) setMark(i, 'empty')
    })
    return true
  }

  const undo = (): boolean => {
    const last = history.value.at(-1)
    if (!last || status.value !== 'playing') return false
    history.value = history.value.slice(0, -1)
    marks.value = last.marks
    ink.value = last.ink
    lastTap = { cell: -1, time: 0 }
    return true
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

  /**
   * Bulb power-up: shows the next logical step. Eliminations are crossed out
   * and their reason highlighted; a forced cat is only highlighted, so the
   * player still places it. X marks on real cat cells are ignored, so a
   * player's mistakes can't mislead the hint.
   */
  const hint = (): boolean => {
    if (status.value !== 'playing') return false
    const { size, regions } = puzzle.value
    const state: CellState[] = marks.value.map((m, i) =>
      m === 'cat' ? CAT : m === 'x' && !isSolutionCell(puzzle.value, i) ? OUT : OPEN,
    )
    const step = nextStep(size, regions, state)
    if (!step) return false
    const target = step.place !== undefined ? [step.place] : step.eliminate
    if (step.place === undefined) {
      snapshot()
      for (const cell of step.eliminate) setMark(cell, 'x', 0)
    }
    const id = Date.now()
    hinted.value = { id, target, reason: step.reason }
    setTimeout(() => hinted.value?.id === id && (hinted.value = null), HINT_MS)
    return true
  }

  /** Mouse power-up: removes X marks wrongly placed on cells that hold a cat. */
  const clearMistakes = (): boolean => {
    if (status.value !== 'playing') return false
    let cleared = false
    marks.value.forEach((m, i) => {
      if (m === 'x' && isSolutionCell(puzzle.value, i)) {
        setMark(i, 'empty')
        cleared = true
      }
    })
    return cleared
  }

  /** Everything needed to resume this board later (see `restore`). */
  const saveState = (): SavedBoard => ({
    marks: [...marks.value],
    ink: [...ink.value],
    mistakes: [...mistakes.value],
    fish: fish.value,
    score: score.value,
    continued: continued.value,
    elapsedMs: Date.now() - startedAt,
  })

  /** Puts a saved board back (same puzzle), keeping the elapsed time. */
  const restore = (saved: SavedBoard) => {
    if (saved.marks.length !== marks.value.length) return
    marks.value = [...saved.marks]
    ink.value = [...saved.ink]
    mistakes.value = new Set(saved.mistakes)
    fish.value = saved.fish
    score.value = saved.score
    continued.value = saved.continued
    startedAt = Date.now() - saved.elapsedMs
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
    ink,
    activeInk,
    history,
    inkUse,
    contradictions,
    ghostRegions,
    mistakes,
    fish,
    score,
    continued,
    mistakeCell,
    placement,
    hinted,
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
    saveState,
    restore,
    setInk,
    eraseInk,
    undo,
  }
}
