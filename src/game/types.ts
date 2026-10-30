/** Index of a cell in a row-major grid: `row * size + col`. */
export type CellIndex = number

/** A Meowdoku puzzle: an N×N grid split into N colored regions. */
export interface Puzzle {
  size: number
  /** `regions[cellIndex]` is the region id (0..size-1) of that cell. */
  regions: number[]
  /** `solution[row]` is the column of the cat in that row. */
  solution: number[]
  seed: number
  /** Hardest deduction needed, as a logic-solver level (see logic.ts). */
  difficulty?: number
}

/**
 * What a cell shows when the pen and one test layer are seen together (see
 * `effective` in useGame). A `ghost` is a test cat: a "what if" cat placed
 * with a test ink, never checked, never costing a fish.
 */
export type Mark = 'empty' | 'x' | 'cat' | 'ghost'

/** The white pen: the player's real marks. */
export type PenMark = 'empty' | 'x' | 'cat'

/** A test ink's marks: X's and test cats, kept apart from the pen. */
export type TestMark = 'empty' | 'x' | 'ghost'

/** One test ink's "what if" layer. */
export interface InkLayer {
  mark: TestMark[]
  /** The X came from a test cat's wave (false = drawn by hand). */
  auto: boolean[]
  /** Order the test cats were placed in (0 = no test cat). */
  seq: number[]
}
