import { describe, expect, it } from 'vitest'
import { impossibleCells } from './hints'
import { sizeForLevel } from './levels'
import { catPoints, useGame } from './useGame'
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

describe('useGame', () => {
  const puzzle = generatePuzzle(6, 5)
  const catCell = (row: number) => row * 6 + puzzle.solution[row]
  const wrongCell = (row: number) => row * 6 + ((puzzle.solution[row] + 3) % 6)

  it('tap toggles an X, double-tap places a correct cat and crosses out what it rules out', () => {
    const game = useGame(puzzle)
    game.press(catCell(0), 1000)
    expect(game.marks.value[catCell(0)]).toBe('x')
    game.press(catCell(0), 1100)
    expect(game.marks.value[catCell(0)]).toBe('cat')
    for (const cell of blockedBy(puzzle, catCell(0))) expect(game.marks.value[cell]).toBe('x')
  })

  it('a wrong cat costs a fish and leaves an X; three mistakes lose the level', () => {
    const game = useGame(puzzle)
    for (const [i, row] of [0, 1, 2].entries()) {
      game.press(wrongCell(row), i * 1000)
      game.press(wrongCell(row), i * 1000 + 100)
    }
    expect(game.fish.value).toBe(0)
    expect(game.marks.value[wrongCell(0)]).toBe('x')
    expect(game.status.value).toBe('lost')
  })

  it('drag paints the first tap mark but never over cats', () => {
    const game = useGame(puzzle)
    game.revealCat()
    const empties = game.marks.value.flatMap((m, i) => (m === 'empty' ? [i] : []))
    game.press(empties[0], 0)
    game.drag(empties[1])
    expect(game.marks.value[empties[1]]).toBe('x')
    game.press(empties[0], 5000) // starts an erase stroke
    game.drag(empties[1])
    expect(game.marks.value[empties[1]]).toBe('empty')
  })

  it('power-ups: cats solve the board, the mouse removes wrong X marks', () => {
    const game = useGame(puzzle)
    game.press(catCell(2), 0)
    expect(game.clearMistakes()).toBe(true)
    expect(game.marks.value[catCell(2)]).toBe('empty')
    for (let i = 0; i < 6; i++) expect(game.revealCat()).toBe(true)
    expect(game.status.value).toBe('won')
    expect(game.revealCat()).toBe(false)
  })

  it('the bulb only ever crosses out cells without a cat', () => {
    const game = useGame(puzzle)
    while (game.status.value === 'playing' && game.hint()) {
      puzzle.solution.forEach((_, row) => expect(game.marks.value[catCell(row)]).toBe('empty'))
    }
    expect(game.marks.value.filter((m) => m === 'empty')).toHaveLength(6)
  })
})

describe('impossibleCells', () => {
  it('finds cells whose cat would empty another region', () => {
    // 4x4 with a one-cell region (3) at the top-left: its neighbours can't hold a cat.
    const regions = [3, 0, 0, 0, 1, 1, 0, 0, 1, 2, 2, 2, 1, 1, 2, 2]
    const puzzle = { size: 4, regions, solution: [0, 2, 0, 0], seed: 0 }
    const marks: Mark[] = new Array(16).fill('empty')
    expect(impossibleCells(puzzle, marks)).toEqual(expect.arrayContaining([1, 4, 5]))
  })
})

describe('levels', () => {
  it('reaches 10x10 by level 29 and caps at 11x11', () => {
    expect(sizeForLevel(1)).toBe(4)
    expect(sizeForLevel(29)).toBe(10)
    expect(sizeForLevel(500)).toBe(11)
  })
})

describe('recording-driven behaviour', () => {
  const puzzle = generatePuzzle(10, 29)
  const catCell = (row: number) => row * 10 + puzzle.solution[row]
  const wrongCell = (row: number) => row * 10 + ((puzzle.solution[row] + 5) % 10)

  it('scores a quick 10x10 cat like the original (+576 after ~4s), less when slow', () => {
    expect(catPoints(10, 4000)).toBe(576)
    expect(catPoints(10, 60_000)).toBeLessThan(576)
    expect(catPoints(10, 10_000_000)).toBe(150)
  })

  it('crosses neighbours first, then the row, then the column, with "Clear!" on line ends', () => {
    const game = useGame(puzzle)
    const cell = catCell(4)
    game.press(cell, Date.now())
    game.press(cell, Date.now() + 50)
    const p = game.placement.value!
    const touching = (c: number) => Math.abs(Math.floor(c / 10) - 4) <= 1 && Math.abs((c % 10) - (cell % 10)) <= 1
    const lastNeighbour = Math.max(...[...p.delays].filter(([c]) => touching(c)).map(([, d]) => d))
    const firstRow = Math.min(...[...p.delays].filter(([c]) => !touching(c) && Math.floor(c / 10) === 4).map(([, d]) => d))
    expect(firstRow).toBeGreaterThan(lastNeighbour)
    expect(p.clears.length).toBe(2)
    expect(p.points).toBeGreaterThan(0)
    expect(game.score.value).toBe(p.points)
  })

  it('marks wrong cats with a red X and offers one fish refill', () => {
    const game = useGame(puzzle)
    for (const [i, row] of [0, 1, 2].entries()) {
      game.press(wrongCell(row), i * 1000)
      game.press(wrongCell(row), i * 1000 + 50)
    }
    expect([...game.mistakes.value].sort()).toEqual([wrongCell(0), wrongCell(1), wrongCell(2)].sort())
    expect(game.catsLeft.value).toBe(10)
    expect(game.status.value).toBe('lost')
    expect(game.continueWithFish()).toBe(true)
    expect(game.status.value).toBe('playing')
    expect(game.fish.value).toBe(3)
    game.press(wrongCell(0), 10_000) // erasing a red X forgets the mistake
    expect(game.mistakes.value.has(wrongCell(0))).toBe(false)
  })

  it('cat power-ups give no points', () => {
    const game = useGame(puzzle)
    game.revealCat()
    expect(game.score.value).toBe(0)
  })
})
