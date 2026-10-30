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

/** Cats that break a rule against another placed cat. */
export function conflictingCats(puzzle: Puzzle, marks: Mark[]): Set<CellIndex> {
  const cats = marks.flatMap((m, i) => (m === 'cat' ? [i] : []))
  const conflicts = new Set<CellIndex>()
  for (const cat of cats) {
    const blocked = new Set(blockedBy(puzzle, cat))
    for (const other of cats) if (other !== cat && blocked.has(other)) conflicts.add(cat)
  }
  return conflicts
}

export function isSolved(puzzle: Puzzle, marks: Mark[]): boolean {
  return marks.every((m, i) => (m === 'cat') === isSolutionCell(puzzle, i))
}
