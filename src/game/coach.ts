import { buildGroups, type Step } from './logic'
import type { CellIndex, Mark, Puzzle } from './types'

/** Where the coach's finger points, and how to tap there. */
export interface CoachTarget {
  cell: CellIndex
  /** Double-tap (a cat) rather than tap (an X). */
  double: boolean
}

/**
 * First levels: the finger shows a real deduction, never a guess. A forced
 * cat asks for a double-tap, and any other step's first crossed-out cell for
 * a tap. With `tapFirst` (the player has not drawn an X yet) a forced cat's
 * cells are shown first: the cat proves them too, so they are just as safe.
 */
export function basicsTarget(step: Step | null, tapFirst = false): CoachTarget | null {
  if (!step) return null
  const cell = step.eliminate[0]
  if (step.place !== undefined && !(tapFirst && cell !== undefined)) return { cell: step.place, double: true }
  return cell === undefined ? null : { cell, double: false }
}

/**
 * Ink coach: a good first test cat goes in the tightest spot, so it shows
 * its consequences fast: an open cell of the row, column or region with the
 * fewest open cells (and no cat yet), as the pen plus one layer show it. A
 * group with a single open cell needs no test, so two or more come first.
 */
export function ghostTarget(puzzle: Puzzle, view: Mark[]): CellIndex | null {
  const { rows, cols, regions } = buildGroups(puzzle.size, puzzle.regions)
  const rank = (n: number) => (n === 1 ? Infinity : n)
  let best: CellIndex[] | null = null
  for (const group of [...regions, ...rows, ...cols]) {
    if (group.some((c) => view[c] === 'cat' || view[c] === 'ghost')) continue
    const open = group.filter((c) => view[c] === 'empty')
    if (open.length > 0 && (!best || rank(open.length) < rank(best.length))) best = open
  }
  return best?.[0] ?? null
}

/** Once per session: the first test cat says it is free. */
export const session = { ghostFreeShown: false }
