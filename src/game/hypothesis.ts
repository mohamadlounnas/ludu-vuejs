import { allGroups, blockedBy, conflictingCats, deadGroups } from './rules'
import type { CellIndex, InkLayer, Mark, PenMark, Puzzle } from './types'

/** The pen and one test layer seen together: the pen wins wherever it has a mark. */
export function effective(pen: PenMark[], layer: InkLayer): Mark[] {
  return pen.map((m, i) => (m === 'empty' ? layer.mark[i] : m))
}

/**
 * The test cat whose guess the layer proves wrong, or null.
 *
 * Starting from the pen alone, it plays the layer's test cats in the order
 * they were placed. The first one is the guess. Every later one must be
 * forced (the only room left in some row, column or region), so it follows
 * from the guess. If that chain runs into a group with no room, or into two
 * cats that clash, the guess is wrong. Hand-drawn test X's never count, so
 * crossing out the guess is always a sound deduction.
 */
export function refutable(puzzle: Puzzle, pen: PenMark[], layer: InkLayer): CellIndex | null {
  const cats = layer.mark
    .flatMap((m, i) => (m === 'ghost' ? [i] : []))
    .sort((a, b) => layer.seq[a] - layer.seq[b])
  if (cats.length === 0) return null
  const groups = allGroups(puzzle)
  const board: Mark[] = [...pen]
  const penDead = new Set(deadGroups(puzzle, pen).map((g) => g.join()))
  const broken = () =>
    deadGroups(puzzle, board).some((g) => !penDead.has(g.join())) || conflictingCats(puzzle, board).size > 0
  for (const [i, cat] of cats.entries()) {
    // The chain so far already fails: later test cats can't save the guess.
    if (i > 0 && !isForced(groups, board, cat)) return null
    board[cat] = 'ghost'
    for (const c of blockedBy(puzzle, cat)) if (pen[c] === 'empty') board[c] = 'x'
    if (broken()) return cats[0]
  }
  return null
}

/** `cell` is the only room left in some group that has no cat yet. */
function isForced(groups: CellIndex[][], board: Mark[], cell: CellIndex): boolean {
  return groups.some(
    (g) =>
      g.includes(cell) &&
      g.every((c) => board[c] !== 'cat' && board[c] !== 'ghost') &&
      g.every((c) => c === cell || board[c] !== 'empty') &&
      board[cell] === 'empty',
  )
}
