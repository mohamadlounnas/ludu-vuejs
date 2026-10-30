import type { CellIndex, Mark, Puzzle } from './types'

export function isSolutionCell(puzzle: Puzzle, cell: CellIndex): boolean {
  return puzzle.solution[Math.floor(cell / puzzle.size)] === cell % puzzle.size
}

/** Cells that share a row, column or region with `cell`, or touch it. */
export function blockedBy(puzzle: Puzzle, cell: CellIndex): CellIndex[] {
  const { size, regions } = puzzle
  const row = Math.floor(cell / size)
  const col = cell % size
  const blocked: CellIndex[] = []
  for (let other = 0; other < size * size; other++) {
    if (other === cell) continue
    const r = Math.floor(other / size)
    const c = other % size
    const touching = Math.abs(r - row) <= 1 && Math.abs(c - col) <= 1
    if (r === row || c === col || regions[other] === regions[cell] || touching) blocked.push(other)
  }
  return blocked
}

/** Cats (real or ghost) that break a rule against another placed cat. */
export function conflictingCats(puzzle: Puzzle, marks: Mark[]): Set<CellIndex> {
  const cats = marks.flatMap((m, i) => (m === 'cat' || m === 'ghost' ? [i] : []))
  const conflicts = new Set<CellIndex>()
  for (const cat of cats) {
    const blocked = new Set(blockedBy(puzzle, cat))
    for (const other of cats) if (other !== cat && blocked.has(other)) conflicts.add(cat)
  }
  return conflicts
}

/**
 * Rows, columns and regions left with no cat and no free cell: whatever
 * crossed them out (usually a test ink) can't be right.
 */
export function deadGroups(puzzle: Puzzle, marks: Mark[]): CellIndex[][] {
  const { size, regions } = puzzle
  const groups: CellIndex[][] = []
  for (let i = 0; i < size; i++) {
    groups.push(Array.from({ length: size }, (_, c) => i * size + c))
    groups.push(Array.from({ length: size }, (_, r) => r * size + i))
    groups.push(regions.flatMap((r, cell) => (r === i ? [cell] : [])))
  }
  return groups.filter((g) => g.every((c) => marks[c] === 'x'))
}

export function isSolved(puzzle: Puzzle, marks: Mark[]): boolean {
  return marks.every((m, i) => (m === 'cat') === isSolutionCell(puzzle, i))
}
