import { blockedBy, isSolutionCell } from './rules'
import type { CellIndex, Mark, Puzzle } from './types'

/** Rows, columns and regions as lists of cells. */
function groups(puzzle: Puzzle): CellIndex[][] {
  const { size, regions } = puzzle
  const all: CellIndex[][] = []
  for (let i = 0; i < size; i++) {
    all.push([...Array(size).keys()].map((c) => i * size + c))
    all.push([...Array(size).keys()].map((r) => r * size + i))
    all.push(regions.flatMap((region, cell) => (region === i ? [cell] : [])))
  }
  return all
}

/**
 * Empty cells that can't hold a cat because a cat there would leave some
 * row, column or region with nowhere to put its own cat. This is the
 * main deduction players use, so the bulb hint teaches it.
 */
export function impossibleCells(puzzle: Puzzle, marks: Mark[]): CellIndex[] {
  const open = groups(puzzle)
    .filter((group) => !group.some((cell) => marks[cell] === 'cat'))
    .map((group) => group.filter((cell) => marks[cell] === 'empty'))

  const found: CellIndex[] = []
  marks.forEach((mark, cell) => {
    if (mark !== 'empty') return
    const covered = new Set([cell, ...blockedBy(puzzle, cell)])
    const starves = open.some(
      (candidates) =>
        candidates.length > 0 && !candidates.includes(cell) && candidates.every((c) => covered.has(c)),
    )
    // Wrong X marks can fool the deduction, so never rule out a real cat.
    if (starves && !isSolutionCell(puzzle, cell)) found.push(cell)
  })
  return found
}
