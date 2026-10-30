import { describe, expect, it } from 'vitest'
import { applyStep, buildGroups, CAT, nextStep, OPEN, OUT, solveLogically, type CellState } from './logic'
import { bandForLevel, PACK_SIZE, sizeForLevel } from './levels'
import { packedLevel, packLength } from '../levels/pack'
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

  it('following the bulb solves the whole puzzle without losing a fish', () => {
    const game = useGame(puzzle)
    let t = 0
    for (let guard = 0; guard < 200 && game.status.value === 'playing'; guard++) {
      const before = game.marks.value.join()
      expect(game.hint()).toBe(true)
      if (game.marks.value.join() === before) {
        // The hint pointed at a forced cat: place it.
        const [cell] = game.hinted.value!.target
        game.press(cell, (t += 1000))
        game.press(cell, t + 50)
      }
    }
    expect(game.status.value).toBe('won')
    expect(game.fish.value).toBe(3)
  })
})

describe('logic solver', () => {
  it('places a cat when a group has a single open cell', () => {
    // 4x4, region 3 is the single cell 0.
    const regions = [3, 0, 0, 0, 1, 1, 0, 0, 1, 2, 2, 2, 1, 1, 2, 2]
    const step = nextStep(4, regions, new Array<CellState>(16).fill(OPEN))!
    expect(step).toMatchObject({ technique: 'single', level: 1, place: 0 })
    expect(step.eliminate).toEqual(expect.arrayContaining([1, 4, 5]))
  })

  it('confines: a region lying in one row clears the rest of that row', () => {
    // Region 0 is cells 0-1 of row 0; rows below are other regions.
    const regions = [0, 0, 1, 1, 2, 2, 2, 1, 2, 3, 3, 1, 3, 3, 3, 3]
    const state = new Array<CellState>(16).fill(OPEN)
    const groups = buildGroups(4, regions)
    const steps = []
    for (let i = 0; i < 3; i++) {
      const step = nextStep(4, regions, state, groups)!
      expect(step.technique).toBe('confine')
      applyStep(state, step)
      steps.push(step)
    }
    expect(steps.some((s) => s.eliminate.includes(2) && s.eliminate.includes(3))).toBe(true)
  })

  it('never contradicts the real solution on generated puzzles', () => {
    for (const size of [6, 8, 10]) {
      const p = generatePuzzle(size, 77)
      const state = new Array<CellState>(size * size).fill(OPEN)
      for (let step = nextStep(size, p.regions, state); step; step = nextStep(size, p.regions, state)) {
        applyStep(state, step)
        state.forEach((s, cell) => {
          const isCat = p.solution[Math.floor(cell / size)] === cell % size
          if (s === OUT) expect(isCat).toBe(false)
          if (s === CAT) expect(isCat).toBe(true)
        })
      }
    }
  })
})

describe('generator difficulty', () => {
  it('only produces puzzles the logic solver finishes, inside the requested band', () => {
    for (const [size, band] of [[6, { min: 1, max: 2 }], [8, { min: 3, max: 3 }], [9, { min: 4, max: 6 }]] as const) {
      const p = generatePuzzle(size, 5, band)
      const result = solveLogically(size, p.regions)
      expect(result.solved).toBe(true)
      expect(result.solution).toEqual(p.solution)
      expect(result.difficulty).toBeGreaterThanOrEqual(band.min)
      expect(result.difficulty).toBeLessThanOrEqual(band.max)
    }
  })
})

describe('level pack', () => {
  it(`ships ${PACK_SIZE} levels, each unique, deduction-only, in its size and band`, () => {
    expect(packLength).toBe(PACK_SIZE)
    for (let level = 1; level <= PACK_SIZE; level++) {
      const p = packedLevel(level)!
      expect(p.size).toBe(sizeForLevel(level))
      const band = bandForLevel(level)
      expect(p.difficulty).toBeGreaterThanOrEqual(band.min)
      expect(p.difficulty).toBeLessThanOrEqual(band.max)
      const result = solveLogically(p.size, p.regions)
      expect(result.solved).toBe(true)
      expect(result.solution).toEqual(p.solution)
      expect(countSolutions(p.size, p.regions)).toBe(1)
    }
  }, 120_000)
})

describe('levels', () => {
  it('reaches 10x10 by level 29, then rotates 9x9 to 11x11', () => {
    expect(sizeForLevel(1)).toBe(4)
    expect(sizeForLevel(29)).toBe(10)
    for (let level = 41; level < 60; level++) expect([9, 10, 11]).toContain(sizeForLevel(level))
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
