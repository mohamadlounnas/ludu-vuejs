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
}

/** What the player has put on a cell. */
export type Mark = 'empty' | 'x' | 'cat'
