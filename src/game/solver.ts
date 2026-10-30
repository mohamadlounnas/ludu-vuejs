/**
 * Finds up to `limit` solutions of a region layout. A solution puts one cat
 * per row, column and region, with no two cats touching (diagonals
 * included); it is returned as the cat's column for each row. Rows are filled
 * top to bottom, so the touching rule only needs checking against the
 * previous row.
 */
export function findSolutions(size: number, regions: number[], limit = 2): number[][] {
  const solutions: number[][] = []
  const cols: number[] = []
  const usedCols = new Array<boolean>(size).fill(false)
  const usedRegions = new Array<boolean>(size).fill(false)

  const place = (row: number): void => {
    if (row === size) {
      solutions.push([...cols])
      return
    }
    const prevCol = row === 0 ? -2 : cols[row - 1]
    for (let col = 0; col < size && solutions.length < limit; col++) {
      if (usedCols[col] || Math.abs(col - prevCol) <= 1) continue
      const region = regions[row * size + col]
      if (usedRegions[region]) continue
      usedCols[col] = usedRegions[region] = true
      cols.push(col)
      place(row + 1)
      cols.pop()
      usedCols[col] = usedRegions[region] = false
    }
  }

  place(0)
  return solutions
}

export function countSolutions(size: number, regions: number[], limit = 2): number {
  return findSolutions(size, regions, limit).length
}

export function solve(size: number, regions: number[]): number[] | null {
  return findSolutions(size, regions, 1)[0] ?? null
}
