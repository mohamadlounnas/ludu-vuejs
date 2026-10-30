import { solveLogically } from './logic'
import { createRng, shuffle } from './rng'
import { findSolutions } from './solver'
import type { Puzzle } from './types'

export const MIN_SIZE = 4
export const MAX_SIZE = 11

/** Accepted difficulty band, in logic-solver levels (see logic.ts). */
export interface DifficultyBand {
  min: number
  max: number
}

export const ANY_DIFFICULTY: DifficultyBand = { min: 0, max: 6 }

/** Random cat layout: one per row and column, never touching. */
function randomCats(size: number, rng: () => number): number[] {
  const cols: number[] = []
  const used = new Array<boolean>(size).fill(false)
  const place = (row: number): boolean => {
    if (row === size) return true
    for (const col of shuffle([...Array(size).keys()], rng)) {
      if (used[col] || (row > 0 && Math.abs(col - cols[row - 1]) <= 1)) continue
      used[col] = true
      cols.push(col)
      if (place(row + 1)) return true
      cols.pop()
      used[col] = false
    }
    return false
  }
  if (!place(0)) throw new Error(`No cat layout exists for size ${size}`)
  return cols
}

function orthogonalNeighbours(size: number, cell: number): number[] {
  const row = Math.floor(cell / size)
  const col = cell % size
  return [
    row > 0 ? cell - size : -1,
    row < size - 1 ? cell + size : -1,
    col > 0 ? cell - 1 : -1,
    col < size - 1 ? cell + 1 : -1,
  ].filter((n) => n !== -1)
}

/** Whether `region` stays one connected area once `removed` leaves it. */
function staysConnected(size: number, regions: number[], region: number, removed: number): boolean {
  const cells = regions.flatMap((r, i) => (r === region && i !== removed ? [i] : []))
  if (cells.length === 0) return false
  const seen = new Set([cells[0]])
  const queue = [cells[0]]
  while (queue.length) {
    for (const n of orthogonalNeighbours(size, queue.pop()!)) {
      if (n !== removed && regions[n] === region && !seen.has(n)) {
        seen.add(n)
        queue.push(n)
      }
    }
  }
  return seen.size === cells.length
}

const pick = <T>(items: T[], weight: (item: T) => number, rng: () => number): T => {
  const weights = items.map(weight)
  let roll = rng() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return items[i]
  }
  return items[items.length - 1]
}

/**
 * Grows one region around each cat. Each region gets a random appetite, so
 * sizes vary (from single cells to big areas like the original's levels),
 * and new cells prefer spots hugged by the region, which keeps shapes as
 * compact blobs instead of noodles.
 */
function growRegions(size: number, cats: number[], rng: () => number): number[] {
  const regions = new Array<number>(size * size).fill(-1)
  cats.forEach((col, row) => (regions[row * size + col] = row))
  const appetite = cats.map(() => 0.15 + rng() * rng() * 3)
  let unassigned = size * size - size

  while (unassigned > 0) {
    const frontiers = new Map<number, number[]>()
    regions.forEach((r, cell) => {
      if (r !== -1) return
      for (const n of orthogonalNeighbours(size, cell)) {
        const owner = regions[n]
        if (owner === -1) continue
        const list = frontiers.get(owner) ?? []
        if (!list.includes(cell)) list.push(cell)
        frontiers.set(owner, list)
      }
    })
    const region = pick([...frontiers.keys()], (r) => appetite[r], rng)
    const hug = (cell: number) => orthogonalNeighbours(size, cell).filter((n) => regions[n] === region).length
    const cell = pick(frontiers.get(region)!, (c) => hug(c) ** 2 + 0.2, rng)
    regions[cell] = region
    unassigned--
  }
  return regions
}

/** Moves `cell` into a neighbouring region if both regions stay connected. */
function moveCell(size: number, regions: number[], cell: number, rng: () => number): boolean {
  if (!staysConnected(size, regions, regions[cell], cell)) return false
  const targets = orthogonalNeighbours(size, cell).filter((n) => regions[n] !== regions[cell])
  if (targets.length === 0) return false
  regions[cell] = regions[targets[Math.floor(rng() * targets.length)]]
  return true
}

/**
 * Generates a puzzle a player can solve by deduction alone, whose hardest
 * required technique falls inside `band`:
 *  1. place N non-touching cats, one per row and column;
 *  2. grow a region around each cat;
 *  3. while the logic solver gets stuck or the difficulty is off, nudge one
 *     border cell into a neighbouring region (cat cells never move, so the
 *     planted solution stays valid) — preferring cells of a rival solution
 *     when one exists, which is what usually makes the solver stuck.
 * A finished logical solve also proves the solution is unique.
 */
export function generatePuzzle(size: number, seed: number, band: DifficultyBand = ANY_DIFFICULTY, maxAttempts = 400): Puzzle {
  if (size < MIN_SIZE || size > MAX_SIZE) {
    throw new Error(`Size must be between ${MIN_SIZE} and ${MAX_SIZE}`)
  }
  const rng = createRng(seed)
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = randomCats(size, rng)
    const isCat = (cell: number) => solution[Math.floor(cell / size)] === cell % size
    const regions = growRegions(size, solution, rng)

    for (let nudge = 0; nudge < size * 6; nudge++) {
      const result = solveLogically(size, regions)
      if (result.solved && result.difficulty >= band.min && result.difficulty <= band.max) {
        // Region ids start out equal to their cat's row; shuffle them so the
        // region colors don't give the solution away.
        const labels = shuffle([...Array(size).keys()], rng)
        return { size, regions: regions.map((r) => labels[r]), solution, seed, difficulty: result.difficulty }
      }
      if (result.solved && result.difficulty < band.min && nudge > size * 3) break

      let candidates: number[]
      const rival = result.solved ? undefined : findSolutions(size, regions, 2).find((s) => s.some((c, r) => c !== solution[r]))
      if (rival) {
        candidates = rival.flatMap((col, row) => (col === solution[row] ? [] : [row * size + col]))
      } else {
        candidates = [...Array(size * size).keys()].filter(
          (c) => !isCat(c) && orthogonalNeighbours(size, c).some((n) => regions[n] !== regions[c]),
        )
      }
      if (!shuffle(candidates, rng).some((c) => !isCat(c) && moveCell(size, regions, c, rng))) break
    }
  }
  throw new Error(`Could not generate a ${size}x${size} puzzle (difficulty ${band.min}-${band.max}) from seed ${seed}`)
}
