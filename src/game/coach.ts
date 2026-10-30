import { refutable } from './hypothesis'
import { buildGroups, type Step } from './logic'
import type { CellIndex, InkLayer, Mark, PenMark, Puzzle } from './types'

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

/** A test layer holding a single test cat, on `cell`. */
function trialLayer(size: number, cell: CellIndex): InkLayer {
  const n = size * size
  const layer: InkLayer = { mark: new Array(n).fill('empty'), auto: new Array(n).fill(false), seq: new Array(n).fill(0) }
  layer.mark[cell] = 'ghost'
  layer.seq[cell] = 1
  return layer
}

/**
 * Ink coach: a good first test cat goes in the tightest spot, so it shows
 * its consequences fast: an open cell of the row, column or region with the
 * fewest open cells (and no cat yet), as the pen plus one layer show it. A
 * group with a single open cell needs no test, so two or more come first.
 *
 * Within those spots it prefers a guess the pen refutes at once: the red
 * shows straight away and teaches "Cross out", rather than a wrong guess
 * that holds for now and could be kept by mistake.
 */
export function ghostTarget(puzzle: Puzzle, view: Mark[], pen: PenMark[]): CellIndex | null {
  const { rows, cols, regions } = buildGroups(puzzle.size, puzzle.regions)
  const rank = (n: number) => (n === 1 ? Infinity : n)
  const spots = [...regions, ...rows, ...cols]
    .filter((group) => !group.some((c) => view[c] === 'cat' || view[c] === 'ghost'))
    .map((group) => group.filter((c) => view[c] === 'empty'))
    .filter((open) => open.length > 0)
    .sort((a, b) => rank(a.length) - rank(b.length))
  for (const open of spots) {
    const refuted = open.find((c) => refutable(puzzle, pen, trialLayer(puzzle.size, c)) !== null)
    if (refuted !== undefined) return refuted
  }
  return spots[0]?.[0] ?? null
}

/** Once per session: the first test cat says it is free. */
export const session = { ghostFreeShown: false }
