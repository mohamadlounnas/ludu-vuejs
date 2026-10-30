import type { CellIndex } from './types'

/**
 * Human-style solver. It only uses deductions a player can make by eye, so a
 * puzzle it finishes needs no guessing, and the hardest technique it needed
 * is the puzzle's difficulty.
 *
 * Techniques, easiest first (the number is the difficulty level):
 *  1 single  – a row, column or region has one open cell left: the cat goes there.
 *  2 confine – a group's open cells all sit inside one other group (a region
 *              lying in one row, a column inside one region...), so the rest of
 *              that other group is crossed out.
 *  3 squeeze – a cat on this cell would cross out every open cell of some
 *              other group, so it can't hold a cat.
 *  4+ confine k – k groups (say k regions) fit inside k other groups (k rows):
 *              those rows belong to those regions, so cross out the rest.
 *              Level = 2 + k (k = 2, 3, 4).
 */
export type Technique = 'single' | 'confine' | 'squeeze'

export interface Step {
  technique: Technique
  level: number
  /** Cell that must hold a cat (singles only). */
  place?: CellIndex
  /** Cells proven empty. */
  eliminate: CellIndex[]
  /** Cells that explain the step (the group(s) involved), for hints. */
  reason: CellIndex[]
}

export const OPEN = 0
export const OUT = 1
export const CAT = 2
export type CellState = typeof OPEN | typeof OUT | typeof CAT

export const MAX_CONFINE = 4

interface Groups {
  rows: CellIndex[][]
  cols: CellIndex[][]
  regions: CellIndex[][]
  /** `blocked[cell]`: cells a cat on `cell` rules out. */
  blocked: CellIndex[][]
}

export function buildGroups(size: number, regions: number[]): Groups {
  const rows: CellIndex[][] = []
  const cols: CellIndex[][] = []
  const regs: CellIndex[][] = Array.from({ length: size }, () => [])
  for (let i = 0; i < size; i++) {
    rows.push(Array.from({ length: size }, (_, c) => i * size + c))
    cols.push(Array.from({ length: size }, (_, r) => r * size + i))
  }
  regions.forEach((r, cell) => regs[r].push(cell))
  const blocked = regions.map((_, cell) => ruledOutBy(size, regions, cell))
  return { rows, cols, regions: regs, blocked }
}

/** Cells a cat on `cell` rules out: same row, column or region, or touching. */
export function ruledOutBy(size: number, regions: number[], cell: CellIndex): CellIndex[] {
  const row = Math.floor(cell / size)
  const col = cell % size
  const out: CellIndex[] = []
  for (let other = 0; other < size * size; other++) {
    if (other === cell) continue
    const r = Math.floor(other / size)
    const c = other % size
    if (r === row || c === col || regions[other] === regions[cell] || (Math.abs(r - row) <= 1 && Math.abs(c - col) <= 1)) {
      out.push(other)
    }
  }
  return out
}

function* combinations<T>(items: T[], k: number, start = 0, picked: T[] = []): Generator<T[]> {
  if (picked.length === k) {
    yield picked
    return
  }
  for (let i = start; i <= items.length - (k - picked.length); i++) {
    yield* combinations(items, k, i + 1, [...picked, items[i]])
  }
}

/** The easiest deduction available from `state`, or null if the solver is stuck. */
export function nextStep(size: number, regions: number[], state: CellState[], groups = buildGroups(size, regions)): Step | null {
  const open = (cells: CellIndex[]) => cells.filter((c) => state[c] === OPEN)
  const unsolved = (cells: CellIndex[]) => !cells.some((c) => state[c] === CAT)
  const all = [...groups.rows, ...groups.cols, ...groups.regions].filter(unsolved)

  // 1. single
  for (const group of all) {
    const cells = open(group)
    if (cells.length === 1) {
      const eliminate = groups.blocked[cells[0]].filter((c) => state[c] === OPEN)
      return { technique: 'single', level: 1, place: cells[0], eliminate, reason: group }
    }
  }

  // 2 and 4+. confine: k groups of one kind fit inside k groups of another kind.
  // Each group's open cells are summarised as a bitmask of the lines of every
  // other kind they touch, so a combination fits when its OR has k bits.
  const kinds = [groups.rows, groups.cols, groups.regions]
  const lineOf = [
    (c: CellIndex) => Math.floor(c / size),
    (c: CellIndex) => c % size,
    (c: CellIndex) => regions[c],
  ]
  const live = kinds.map((list) =>
    list.map((g, i) => ({ i, cells: open(g) })).filter((g) => g.cells.length > 0 && unsolved(list[g.i])),
  )
  const masks = live.map((list) => list.map((g) => [0, 1, 2].map((b) => g.cells.reduce((m, c) => m | (1 << lineOf[b](c)), 0))))
  for (let k = 1; k <= MAX_CONFINE; k++) {
    for (let a = 0; a < 3; a++) {
      if (live[a].length < k) continue
      const indices = live[a].map((_, i) => i)
      for (let b = 0; b < 3; b++) {
        if (a === b) continue
        for (const combo of combinations(indices, k)) {
          let mask = 0
          for (const i of combo) mask |= masks[a][i][b]
          if (popcount(mask) !== k) continue
          const inside = new Set(combo.flatMap((i) => live[a][i].cells))
          const coverCells = kinds[b].filter((_, line) => mask & (1 << line)).flat()
          const eliminate = open(coverCells).filter((c) => !inside.has(c))
          if (eliminate.length > 0) {
            return { technique: 'confine', level: k === 1 ? 2 : 2 + k, eliminate, reason: [...inside] }
          }
        }
      }
    }
    // Squeeze sits between confine-1 and confine-2 in difficulty.
    if (k === 1) {
      const squeeze = findSqueeze(state, all, groups.blocked)
      if (squeeze) return squeeze
    }
  }
  return null
}

function popcount(n: number): number {
  let count = 0
  for (; n; n &= n - 1) count++
  return count
}

function findSqueeze(state: CellState[], groups: CellIndex[][], blocked: CellIndex[][]): Step | null {
  const openGroups = groups.map((g) => g.filter((c) => state[c] === OPEN))
  for (let cell = 0; cell < state.length; cell++) {
    if (state[cell] !== OPEN) continue
    const covered = new Set(blocked[cell])
    covered.add(cell)
    const starved = openGroups.find((g) => g.length > 0 && !g.includes(cell) && g.every((c) => covered.has(c)))
    if (starved) return { technique: 'squeeze', level: 3, eliminate: [cell], reason: starved }
  }
  return null
}

export function applyStep(state: CellState[], step: Step) {
  if (step.place !== undefined) state[step.place] = CAT
  for (const c of step.eliminate) state[c] = OUT
}

export interface LogicResult {
  solved: boolean
  /** Hardest technique level needed (0 if nothing was needed). */
  difficulty: number
  steps: number
  /** How many steps used each level. */
  uses: Record<number, number>
  /** Cat column per row, when solved. */
  solution: number[]
}

/** Solves by deduction only, always taking the easiest step available. */
export function solveLogically(size: number, regions: number[]): LogicResult {
  const groups = buildGroups(size, regions)
  const state: CellState[] = new Array(size * size).fill(OPEN)
  const uses: Record<number, number> = {}
  let difficulty = 0
  let steps = 0
  for (;;) {
    const step = nextStep(size, regions, state, groups)
    if (!step) break
    applyStep(state, step)
    uses[step.level] = (uses[step.level] ?? 0) + 1
    difficulty = Math.max(difficulty, step.level)
    steps++
  }
  const cats = state.flatMap((s, i) => (s === CAT ? [i] : []))
  const solved = cats.length === size
  return {
    solved,
    difficulty,
    steps,
    uses,
    solution: solved ? cats.sort((a, b) => a - b).map((c) => c % size) : [],
  }
}
