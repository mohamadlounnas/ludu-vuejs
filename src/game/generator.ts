import { createRng, shuffle } from './rng'
import { findSolutions } from './solver'
import type { Puzzle } from './types'

export const MIN_SIZE = 4
export const MAX_SIZE = 11

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

/**
 * Breaks an unwanted solution by moving one of its cat cells into a
 * neighbouring region. Cells of the intended solution are never moved, so it
 * stays valid. Returns false when no such move exists.
 */
function breakSolution(size: number, regions: number[], solution: number[], other: number[], rng: () => number): boolean {
  const candidates = shuffle(
    other.flatMap((col, row) => (col === solution[row] ? [] : [row * size + col])),
    rng,
  )
  for (const cell of candidates) {
    if (!staysConnected(size, regions, regions[cell], cell)) continue
    const targets = orthogonalNeighbours(size, cell).filter((n) => regions[n] !== regions[cell])
    if (targets.length === 0) continue
    regions[cell] = regions[targets[Math.floor(rng() * targets.length)]]
    return true
  }
  return false
}

/** Grows one region around each cat by random flood fill until the grid is covered. */
function growRegions(size: number, cats: number[], rng: () => number): number[] {
  const regions = new Array<number>(size * size).fill(-1)
  cats.forEach((col, row) => (regions[row * size + col] = row))
  let unassigned = size * size - size

  while (unassigned > 0) {
    const cell = Math.floor(rng() * size * size)
    if (regions[cell] !== -1) continue
    const neighbours = orthogonalNeighbours(size, cell).filter((n) => regions[n] !== -1)
    if (neighbours.length === 0) continue
    regions[cell] = regions[neighbours[Math.floor(rng() * neighbours.length)]]
    unassigned--
  }
  return regions
}

/**
 * Generates a puzzle with exactly one solution: grow random regions around a
 * random cat layout, then repair the regions until the solver finds no other
 * solution. The seed makes the result repeatable.
 */
export function generatePuzzle(size: number, seed: number, maxAttempts = 200): Puzzle {
  if (size < MIN_SIZE || size > MAX_SIZE) {
    throw new Error(`Size must be between ${MIN_SIZE} and ${MAX_SIZE}`)
  }
  const rng = createRng(seed)
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = randomCats(size, rng)
    const regions = growRegions(size, solution, rng)
    for (let repair = 0; repair < size * size * 2; repair++) {
      const other = findSolutions(size, regions, 2).find((s) => s.some((col, row) => col !== solution[row]))
      if (!other) {
        // Region ids start out equal to their cat's row; shuffle them so the
        // region colors don't give the solution away.
        const labels = shuffle([...Array(size).keys()], rng)
        return { size, regions: regions.map((r) => labels[r]), solution, seed }
      }
      if (!breakSolution(size, regions, solution, other, rng)) break
    }
  }
  throw new Error(`Could not generate a unique ${size}x${size} puzzle from seed ${seed}`)
}
