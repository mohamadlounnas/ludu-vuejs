import { describe, expect, it } from 'vitest'
import { generatePuzzle } from './generator'
import { blockedBy, conflictingCats, isSolved } from './rules'
import { countSolutions, solve } from './solver'
import type { Mark } from './types'

describe('generatePuzzle', () => {
  it.each([4, 5, 6, 7, 8, 9, 10, 11])('makes a %ix%i puzzle with exactly one solution', (size) => {
    const puzzle = generatePuzzle(size, 1234)
    expect(new Set(puzzle.regions).size).toBe(size)
    expect(countSolutions(size, puzzle.regions)).toBe(1)
    expect(solve(size, puzzle.regions)).toEqual(puzzle.solution)
  })

  it('is deterministic for a seed', () => {
    expect(generatePuzzle(6, 42)).toEqual(generatePuzzle(6, 42))
  })

  it('makes every region a single connected area', () => {
    const { size, regions } = generatePuzzle(8, 7)
    for (let region = 0; region < size; region++) {
      const cells = regions.flatMap((r, i) => (r === region ? [i] : []))
      const seen = new Set([cells[0]])
      const queue = [cells[0]]
      while (queue.length) {
        const cell = queue.pop()!
        for (const n of [cell - size, cell + size, cell % size ? cell - 1 : -1, (cell + 1) % size ? cell + 1 : -1]) {
          if (n >= 0 && n < size * size && regions[n] === region && !seen.has(n)) {
            seen.add(n)
            queue.push(n)
          }
        }
      }
      expect(seen.size).toBe(cells.length)
    }
  })
})

describe('rules', () => {
  const puzzle = generatePuzzle(5, 99)

  it('blocks diagonal neighbours', () => {
    expect(blockedBy(puzzle, 0)).toContain(puzzle.size + 1)
  })

  it('flags touching cats as conflicts', () => {
    const marks: Mark[] = new Array(25).fill('empty')
    marks[0] = marks[6] = 'cat'
    expect([...conflictingCats(puzzle, marks)].sort()).toEqual([0, 6])
  })

  it('recognises the solved board', () => {
    const marks: Mark[] = new Array(25).fill('empty')
    puzzle.solution.forEach((col, row) => (marks[row * 5 + col] = 'cat'))
    expect(isSolved(puzzle, marks)).toBe(true)
    expect(conflictingCats(puzzle, marks).size).toBe(0)
  })
})
