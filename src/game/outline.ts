import type { CellIndex } from './types'

/**
 * SVG path around a group of cells, in cell units: cell (row, col) spans
 * x col..col+1 and y row..row+1. It follows every cell edge whose neighbour is
 * outside the group, chained into closed loops (clockwise), so a dash
 * animation traces each loop as one continuous stroke.
 */
export function groupOutline(size: number, cells: CellIndex[]): string {
  const inside = new Set(cells)
  const has = (r: number, c: number) => r >= 0 && c >= 0 && r < size && c < size && inside.has(r * size + c)
  const key = (x: number, y: number) => `${x},${y}`

  // Directed boundary edges, keyed by their start point.
  const edges = new Map<string, [number, number][]>()
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const list = edges.get(key(x0, y0)) ?? []
    list.push([x1, y1])
    edges.set(key(x0, y0), list)
  }
  for (const cell of [...inside].sort((a, b) => a - b)) {
    const r = Math.floor(cell / size)
    const c = cell % size
    if (!has(r - 1, c)) add(c, r, c + 1, r)
    if (!has(r, c + 1)) add(c + 1, r, c + 1, r + 1)
    if (!has(r + 1, c)) add(c + 1, r + 1, c, r + 1)
    if (!has(r, c - 1)) add(c, r + 1, c, r)
  }

  const loops: string[] = []
  for (;;) {
    // Start each loop at its top-left corner, for a stable drawing order.
    const start = [...edges.keys()].map((k) => k.split(',').map(Number)).sort((a, b) => a[1] - b[1] || a[0] - b[0])[0]
    if (!start) break
    let [x, y] = start
    const points: [number, number][] = [[x, y]]
    for (;;) {
      const list = edges.get(key(x, y))
      if (!list?.length) break
      const [nx, ny] = list.shift()!
      if (list.length === 0) edges.delete(key(x, y))
      ;[x, y] = [nx, ny]
      points.push([x, y])
    }
    loops.push(pathOf(points))
  }
  return loops.join(' ')
}

/** "M … L … Z", keeping only the corners. */
function pathOf(points: [number, number][]): string {
  const corners = points.filter((p, i) => {
    if (i === 0 || i === points.length - 1) return i === 0
    const [a, b] = [points[i - 1], points[i + 1]]
    return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0])
  })
  return `M${corners.map(([x, y]) => `${x} ${y}`).join(' L')} Z`
}

/** Length of `groupOutline`, in cell units: the number of cell edges it follows. */
export function outlineLength(size: number, cells: CellIndex[]): number {
  const inside = new Set(cells)
  const has = (r: number, c: number) => r >= 0 && c >= 0 && r < size && c < size && inside.has(r * size + c)
  let edges = 0
  for (const cell of inside) {
    const r = Math.floor(cell / size)
    const c = cell % size
    edges += [has(r - 1, c), has(r, c + 1), has(r + 1, c), has(r, c - 1)].filter((n) => !n).length
  }
  return edges
}

/**
 * Centre of a cell, in % of the board's gap-centred area (the board inset by
 * its padding less half a gap, as `.proofs` is): there every cell step is
 * exactly 1/size, gaps included.
 */
export function cellCenter(size: number, cell: CellIndex): { x: number; y: number } {
  return { x: ((cell % size) + 0.5) * (100 / size), y: (Math.floor(cell / size) + 0.5) * (100 / size) }
}
