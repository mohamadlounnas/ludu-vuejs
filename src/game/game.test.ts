import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyStep, buildGroups, CAT, nextStep, OPEN, OUT, solveLogically, type CellState } from './logic'
import { bandForLevel, PACK_SIZE, sizeForLevel } from './levels'
import { packedLevel, packLength } from '../levels/pack'
import { catPoints, HINT_STEP_MS, HINT_WAVE_START_MS, useGame } from './useGame'
import { generatePuzzle } from './generator'
import { blockedBy, conflictingCats, isSolved } from './rules'
import { cellCenter, groupOutline, outlineLength } from './outline'
import { basicsTarget, ghostTarget } from './coach'
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

describe('test inks (what-if reasoning)', () => {
  const puzzle = generatePuzzle(8, 31)
  const size = 8
  const catCell = (row: number) => row * size + puzzle.solution[row]
  const isCatCell = (c: number) => puzzle.solution[Math.floor(c / size)] === c % size
  type Game = ReturnType<typeof useGame>
  let clock = 0
  /** A tap the double-tap window has long forgotten, then the finger lifts. */
  const tap = (game: Game, cell: number) => {
    game.press(cell, (clock += 1000))
    game.release()
  }
  const tapTwice = (game: Game, cell: number) => {
    game.press(cell, (clock += 1000))
    game.press(cell, clock + 50)
    game.release()
  }
  const testCat = (game: Game, ink: number, cell: number) => {
    game.setInk(ink)
    tapTwice(game, cell)
  }
  /** A cell whose test cat alone leaves some group with no room. */
  const deadlyCell = () =>
    puzzle.regions.findIndex((_, cell) => {
      const game = useGame(puzzle)
      testCat(game, 1, cell)
      return game.contradictions.value.inks[0]!.dead.length > 0
    })

  it('keeps each ink in its own layer: two test cats on one row never clash', () => {
    const game = useGame(puzzle)
    const a = catCell(0)
    const b = [...Array(size).keys()].find((c) => {
      if (Math.abs(c - a) <= 1) return false
      const probe = useGame(puzzle)
      testCat(probe, 2, c)
      return probe.contradictions.value.broken.size === 0
    })!
    testCat(game, 1, a)
    testCat(game, 2, b)
    expect(game.layers.value[1].mark[a]).toBe('ghost')
    expect(game.layers.value[2].mark[b]).toBe('ghost')
    expect(game.contradictions.value.broken.size).toBe(0)
    const shared = [...Array(size).keys()].filter((c) => c !== a && c !== b)
    for (const c of shared) {
      expect(game.layers.value[1].mark[c]).toBe('x')
      expect(game.layers.value[2].mark[c]).toBe('x')
    }
    expect(game.marks.value.every((m) => m === 'empty')).toBe(true)
    expect(game.fish.value).toBe(3)
  })

  it('an ink-2 tap never touches an ink-1 X', () => {
    const game = useGame(puzzle)
    game.setInk(1)
    tap(game, 10)
    game.setInk(2)
    tap(game, 10)
    expect(game.layers.value[1].mark[10]).toBe('x')
    expect(game.layers.value[2].mark[10]).toBe('x')
    expect(game.inkUse.value).toEqual([0, 1, 1, 0])
  })

  it('test inks never write over the pen', () => {
    const game = useGame(puzzle)
    tap(game, 5)
    game.setInk(1)
    expect(game.press(5, (clock += 1000))).toBe('blocked')
    expect(game.layers.value[1].mark[5]).toBe('empty')
    expect(game.marks.value[5]).toBe('x')
  })

  it("removing a test cat takes back only the X's it alone was responsible for", () => {
    const game = useGame(puzzle)
    const a = catCell(1)
    const b = catCell(3)
    game.setInk(1)
    const handDrawn = blockedBy(puzzle, a).find((c) => !blockedBy(puzzle, b).includes(c))!
    tap(game, handDrawn)
    testCat(game, 1, a)
    testCat(game, 1, b)
    const layer = game.layers.value[1]
    expect(layer.auto[handDrawn]).toBe(false)
    expect(game.press(a, (clock += 1000))).toBe('unghost')
    game.release()
    expect(layer.mark[a]).toBe('empty')
    expect(layer.mark[handDrawn]).toBe('x')
    const keptByB = new Set(blockedBy(puzzle, b))
    for (const c of blockedBy(puzzle, a)) {
      if (c !== handDrawn) expect(layer.mark[c]).toBe(keptByB.has(c) ? 'x' : 'empty')
    }
    expect(layer.mark[b]).toBe('ghost')
    expect(game.erased.value!.cells.length).toBeGreaterThan(0)
  })

  it('a test cat that leaves a group with no room is refutable, and Cross out proves it', () => {
    const cell = deadlyCell()
    expect(cell).toBeGreaterThanOrEqual(0)
    const game = useGame(puzzle)
    testCat(game, 1, cell)
    expect(game.contradictions.value.broken.has(1)).toBe(true)
    expect(game.refutable(1)).toBe(cell)
    expect(game.keepInk(1)).toBe(false)
    expect(game.crossOutGuess(1)).toBe(true)
    expect(game.marks.value[cell]).toBe('x')
    expect(game.inkUse.value[1]).toBe(0)
    expect(game.fish.value).toBe(3)
    expect(game.proof.value?.cell).toBe(cell)
    expect(game.crossOutGuess(1)).toBe(false)
  })

  it('two clashing test cats that were both guesses are not refutable', () => {
    const game = useGame(puzzle)
    const a = catCell(2)
    const b = a + 1 < (Math.floor(a / size) + 1) * size ? a + size + 1 : a + size - 1
    testCat(game, 1, a)
    testCat(game, 1, b)
    expect(game.layers.value[1].mark[b]).toBe('ghost')
    expect(game.contradictions.value.inks[0]!.clash.sort()).toEqual([a, b].sort())
    expect(game.contradictions.value.broken.has(1)).toBe(true)
    expect(game.refutable(1)).toBeNull()
  })

  it('undo only takes back what nothing has overwritten since', () => {
    const game = useGame(puzzle)
    // The mouse removed the X: undo can't bring it back.
    tap(game, catCell(0))
    expect(game.clearMistakes()).toBe(true)
    expect(game.undo()).toBe(false)
    expect(game.marks.value[catCell(0)]).toBe('empty')

    // A real cat and its wave stay, but an earlier unrelated X still goes.
    const cat = catCell(4)
    const unrelated = puzzle.regions.findIndex((_, c) => c !== cat && !blockedBy(puzzle, cat).includes(c) && !isCatCell(c))
    tap(game, unrelated)
    tapTwice(game, cat)
    expect(game.marks.value[cat]).toBe('cat')
    expect(game.canUndo.value).toBe(true)
    expect(game.undo()).toBe(true)
    expect(game.marks.value[unrelated]).toBe('empty')
    expect(game.marks.value[cat]).toBe('cat')
    for (const c of blockedBy(puzzle, cat)) expect(game.marks.value[c]).toBe('x')
    expect(game.canUndo.value).toBe(false)
    expect(game.eraseInk(0)).toBe(false)
  })

  it("undo after a hint keeps the hint X's", () => {
    // Follow the bulb until it crosses something out, placing the cats it points at.
    const probe = useGame(puzzle)
    const cats: number[] = []
    for (let guard = 0; guard < 20; guard++) {
      const before = probe.marks.value.join()
      probe.hint()
      if (probe.marks.value.join() !== before) break
      cats.push(probe.hinted.value!.target[0])
      tapTwice(probe, cats.at(-1)!)
    }
    // Replay with an X of the player's on a free cat cell (hints ignore those) just before the hint.
    const game = useGame(puzzle)
    for (const cat of cats) tapTwice(game, cat)
    const mine = puzzle.solution.map((col, row) => row * size + col).find((c) => game.marks.value[c] === 'empty')!
    tap(game, mine)
    const before = [...game.marks.value]
    expect(game.hint()).toBe(true)
    const crossed = before.flatMap((m, i) => (m !== game.marks.value[i] ? [i] : []))
    expect(crossed.length).toBeGreaterThan(0)
    expect(game.undo()).toBe(true)
    expect(game.marks.value[mine]).toBe('empty')
    for (const c of crossed) expect(game.marks.value[c]).toBe('x')
  })

  it('undo takes back a test cat with its wave in one step', () => {
    const game = useGame(puzzle)
    testCat(game, 2, catCell(5))
    expect(game.inkUse.value[2]).toBeGreaterThan(1)
    expect(game.undo()).toBe(true)
    expect(game.inkUse.value[2]).toBe(0)
    expect(game.restored.value!.cells).toContain(catCell(5))
  })

  it('power-ups read the pen only', () => {
    const plain = useGame(puzzle)
    plain.hint()
    const full = useGame(puzzle)
    full.setInk(3)
    full.press(0, (clock += 1000))
    for (let c = 1; c < size * size; c++) full.drag(c)
    full.release()
    expect(full.inkUse.value[3]).toBe(size * size)
    full.hint()
    expect(full.hinted.value!.target).toEqual(plain.hinted.value!.target)
    expect(full.hinted.value!.reason).toEqual(plain.hinted.value!.reason)

    const game = useGame(puzzle)
    game.setInk(1)
    tap(game, catCell(0))
    expect(game.clearMistakes()).toBe(false)
    expect(game.layers.value[1].mark[catCell(0)]).toBe('x')
  })

  it("a pen X overrules a test cat; a real cat turns test X's into pen X's", () => {
    const game = useGame(puzzle)
    testCat(game, 1, catCell(6))
    game.setInk(0)
    tap(game, catCell(6))
    expect(game.marks.value[catCell(6)]).toBe('x')
    expect(game.inkUse.value[1]).toBe(0)
    expect(game.refuted.value).toMatchObject({ ink: 1, cell: catCell(6) })

    game.load(puzzle)
    const neighbour = blockedBy(puzzle, catCell(4)).find((c) => !isCatCell(c))!
    game.setInk(2)
    tap(game, neighbour)
    game.setInk(0)
    tapTwice(game, catCell(4))
    expect(game.marks.value[neighbour]).toBe('x')
    expect(game.layers.value[2].mark[neighbour]).toBe('empty')
  })

  it('Keep places the test cats for real; a wrong one costs one fish and ends it', () => {
    vi.useFakeTimers()
    try {
      const game = useGame(puzzle)
      testCat(game, 1, catCell(0))
      testCat(game, 1, catCell(2))
      const handDrawn = catCell(5) + (catCell(5) % size === 0 ? 1 : -1)
      game.setInk(1)
      tap(game, handDrawn)
      expect(game.keepInk(1)).toBe(true)
      expect(game.committing.value).toBe(true)
      vi.runAllTimers()
      expect(game.committing.value).toBe(false)
      expect(game.marks.value[catCell(0)]).toBe('cat')
      expect(game.marks.value[catCell(2)]).toBe('cat')
      expect(game.marks.value[handDrawn]).toBe('x')
      expect(game.inkUse.value[1]).toBe(0)
      expect(game.fish.value).toBe(3)
      expect(game.score.value).toBeGreaterThan(0)

      const wrong = useGame(puzzle)
      const bad = [...Array(size * size).keys()].find((c) => {
        if (isCatCell(c) || blockedBy(puzzle, c).includes(catCell(7))) return false
        const probe = useGame(puzzle)
        testCat(probe, 1, c)
        testCat(probe, 1, catCell(7))
        return probe.contradictions.value.broken.size === 0
      })!
      testCat(wrong, 1, bad)
      testCat(wrong, 1, catCell(7))
      expect(wrong.keepInk(1)).toBe(true)
      vi.runAllTimers()
      expect(wrong.fish.value).toBe(2)
      expect(wrong.mistakes.value.has(bad)).toBe(true)
      expect(wrong.marks.value[catCell(7)]).not.toBe('cat')
      expect(wrong.inkUse.value[1]).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('saves and restores test layers, and migrates saves from before layers', () => {
    const game = useGame(puzzle)
    testCat(game, 1, catCell(3))
    game.setInk(2)
    tap(game, 0)
    tap(game, 1)
    const saved = JSON.parse(JSON.stringify(game.saveState()))
    expect(saved.ink).toBeUndefined()
    const back = useGame(puzzle)
    back.restore(saved)
    expect(back.layers.value).toEqual(game.layers.value)
    expect(back.marks.value).toEqual(game.marks.value)
    testCat(back, 3, 20)
    expect(back.layers.value[3].seq[20]).toBeGreaterThan(game.layers.value[1].seq[catCell(3)])

    const legacy = {
      marks: new Array<Mark>(size * size).fill('empty'),
      ink: new Array<number>(size * size).fill(0),
      mistakes: [],
      fish: 2,
      score: 10,
      continued: false,
      elapsedMs: 0,
    }
    legacy.marks[3] = 'x' // pen
    legacy.marks[9] = 'ghost'
    legacy.ink[9] = 2
    legacy.marks[30] = 'x'
    legacy.ink[30] = 2
    legacy.marks[40] = 'ghost'
    legacy.ink[40] = 3
    const migrated = useGame(puzzle)
    migrated.restore(legacy)
    expect(migrated.marks.value[3]).toBe('x')
    expect(migrated.marks.value.filter((m) => m !== 'empty')).toHaveLength(1)
    expect(migrated.layers.value[2].mark[9]).toBe('ghost')
    expect(migrated.layers.value[2].mark[30]).toBe('x')
    expect(migrated.layers.value[2].auto[30]).toBe(false)
    expect(migrated.layers.value[3].mark[40]).toBe('ghost')
    expect(migrated.layers.value[3].seq[40]).toBeGreaterThan(migrated.layers.value[2].seq[9])
    expect(migrated.fish.value).toBe(2)
  })
})

describe('bulb spotlight', () => {
  const puzzle = generatePuzzle(8, 31)
  const size = 8
  /** Follows the bulb (placing the cats it shows) until it crosses something out. */
  const eliminatingHint = () => {
    const game = useGame(puzzle)
    let clock = 0
    for (let guard = 0; guard < 30; guard++) {
      expect(game.hint()).toBe(true)
      const h = game.hinted.value!
      if (h.place === undefined) return game
      game.press(h.place, (clock += 1000))
      game.press(h.place, clock + 50)
      game.release()
    }
    throw new Error('the bulb never crossed anything out')
  }

  it('names the technique and crosses out in a wave from the reason, covering every eliminated cell', () => {
    const game = eliminatingHint()
    const h = game.hinted.value!
    expect(['single', 'confine', 'squeeze']).toContain(h.technique)
    expect([...h.delays.keys()].sort((a, b) => a - b)).toEqual([...h.target].sort((a, b) => a - b))
    const times = [...h.delays.values()]
    expect(times).toEqual(times.map((_, i) => HINT_WAVE_START_MS + i * HINT_STEP_MS))
    for (const cell of h.target) expect(game.marks.value[cell]).toBe('x')
    // Nearest the reason's centre first.
    const mid = (f: (c: number) => number) => h.reason.reduce((s, c) => s + f(c), 0) / h.reason.length
    const [r0, c0] = [mid((c) => Math.floor(c / size)), mid((c) => c % size)]
    const dist = [...h.delays.keys()].map((c) => Math.hypot(Math.floor(c / size) - r0, (c % size) - c0))
    expect(dist).toEqual([...dist].sort((a, b) => a - b))
  })

  it('a forced cat is only shown: no X, no wave', () => {
    const game = useGame(puzzle)
    let clock = 0
    for (let guard = 0; guard < 30; guard++) {
      const before = game.marks.value.join()
      game.hint()
      const h = game.hinted.value!
      if (h.place !== undefined) {
        expect(h.technique).toBe('single')
        expect(h.delays.size).toBe(0)
        expect(game.marks.value.join()).toBe(before)
        return
      }
      game.press(0, (clock += 1000)) // any tap ends the spotlight...
      game.undo()
    }
  })

  it('any tap sends the spotlight away at once', () => {
    const game = eliminatingHint()
    expect(game.hinted.value).not.toBeNull()
    const open = game.marks.value.findIndex((m) => m === 'empty')
    game.press(open, 1e9)
    expect(game.hinted.value).toBeNull()
  })
})

describe('coach', () => {
  const puzzle = generatePuzzle(6, 5)
  const state = (marks: Mark[]): CellState[] => marks.map((m) => (m === 'cat' ? CAT : m === 'x' ? OUT : OPEN))

  it('points only at what the pen proves, and follows the player step by step', () => {
    const game = useGame(puzzle)
    let clock = 0
    for (let guard = 0; guard < 200 && game.status.value === 'playing'; guard++) {
      const step = nextStep(puzzle.size, puzzle.regions, state(game.marks.value))!
      const target = basicsTarget(game.provenStep(), guard % 2 === 0)!
      if (target.double) {
        expect(target.cell).toBe(step.place)
        game.press(target.cell, (clock += 1000))
        game.press(target.cell, clock + 50)
      } else {
        expect(step.eliminate).toContain(target.cell)
        // Proven empty: never a cat's cell.
        expect(puzzle.solution[Math.floor(target.cell / 6)]).not.toBe(target.cell % 6)
        game.press(target.cell, (clock += 1000))
      }
      game.release()
    }
    expect(game.status.value).toBe('won')
    expect(game.fish.value).toBe(3)
  })

  it("shows a forced cat's crossed-out cells first until the player has drawn an X", () => {
    const step = { technique: 'single' as const, level: 1, place: 7, eliminate: [1, 2], reason: [6, 7] }
    expect(basicsTarget(step, true)).toEqual({ cell: 1, double: false })
    expect(basicsTarget(step, false)).toEqual({ cell: 7, double: true })
    expect(basicsTarget({ ...step, eliminate: [] }, true)).toEqual({ cell: 7, double: true })
    expect(basicsTarget(null)).toBeNull()
  })

  it('suggests a first test cat in the tightest open group', () => {
    const { rows, cols, regions } = buildGroups(6, puzzle.regions)
    const check = (view: Mark[]) => {
      const groups = [...rows, ...cols, ...regions].filter((g) => !g.some((c) => view[c] === 'cat'))
      const openIn = (g: number[]) => g.filter((c) => view[c] === 'empty').length
      const counts = groups.map(openIn).filter((n) => n > 0)
      const fewest = Math.min(...counts.filter((n) => n > 1), Infinity)
      const cell = ghostTarget(puzzle, view)!
      expect(view[cell]).toBe('empty')
      expect(groups.some((g) => g.includes(cell) && openIn(g) === (fewest === Infinity ? 1 : fewest))).toBe(true)
    }
    const view: Mark[] = new Array(36).fill('empty')
    check(view)
    // Row 0 down to two open cells: the tightest spot worth a test.
    for (let c = 2; c < 6; c++) view[c] = 'x'
    check(view)
    view[0] = 'cat'
    check(view)
    expect(ghostTarget(puzzle, new Array(36).fill('x'))).toBeNull()
  })

  it('cell centres sit on the gap-centred grid', () => {
    expect(cellCenter(5, 0)).toEqual({ x: 10, y: 10 })
    expect(cellCenter(5, 13)).toEqual({ x: 70, y: 50 })
  })
})

describe('group outlines', () => {
  it('traces one closed loop around a group, on the cell edges', () => {
    // An L of three cells in a 3x3 grid: (0,0), (1,0), (1,1).
    expect(groupOutline(3, [0, 3, 4])).toBe('M0 0 L1 0 L1 1 L2 1 L2 2 L0 2 Z')
    expect(outlineLength(3, [0, 3, 4])).toBe(8)
  })

  it('draws one loop per separate piece', () => {
    expect(groupOutline(3, [0, 8]).match(/M/g)).toHaveLength(2)
  })
})

describe('sound', () => {
  /** A stand-in AudioContext that records when (and what) each sound would start. */
  class FakeAudio {
    static made = 0
    static last: FakeAudio
    currentTime = 10
    state = 'running'
    sampleRate = 8000
    destination = {}
    starts: { kind: 'tone' | 'noise'; at: number; freq?: number; type?: string; stoppedAt?: number }[] = []
    constructor() {
      FakeAudio.made++
      FakeAudio.last = this
    }
    private param = (value = 0) => ({ value, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() })
    private node = () => ({ connect: <T>(next: T) => next })
    createGain = () => ({ ...this.node(), gain: this.param(1) })
    createBiquadFilter = () => ({ ...this.node(), type: '', Q: this.param(), frequency: this.param() })
    createDynamicsCompressor = () => ({ ...this.node(), ...Object.fromEntries(['threshold', 'knee', 'ratio', 'attack', 'release'].map((k) => [k, this.param()])) })
    createBuffer = (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) })
    createOscillator = () => {
      const frequency = this.param()
      const osc = {
        ...this.node(),
        type: 'sine',
        frequency,
        start: (at: number) => this.starts.push({ kind: 'tone', at, freq: frequency.setValueAtTime.mock.calls[0]?.[0], type: osc.type }),
        stop: vi.fn(),
      }
      return osc
    }
    createBufferSource = () => {
      const start = { kind: 'noise' as const, at: 0, stoppedAt: undefined as number | undefined }
      return {
        ...this.node(),
        buffer: null,
        start: (at: number) => this.starts.push(Object.assign(start, { at })),
        // The last stop() is the one that counts.
        stop: (at: number) => (start.stoppedAt = at),
      }
    }
    resume = vi.fn()
    suspend = vi.fn()
  }

  /** A fresh sound module (it keeps its context), with the fake installed. */
  const fresh = async (sound = true) => {
    vi.resetModules()
    vi.stubGlobal('AudioContext', FakeAudio)
    FakeAudio.made = 0
    const { progress } = await import('./progress')
    progress.settings.sound = sound
    const { sfx } = await import('./sfx')
    return sfx
  }
  const since = (at: number) => Math.round((at - FakeAudio.last.currentTime) * 1000)

  afterEach(() => vi.unstubAllGlobals())

  it('plays at most 14 plinks for a big wave, each as its X draws', async () => {
    const puzzle = generatePuzzle(11, 4)
    const game = useGame(puzzle)
    const cell = 5 * 11 + puzzle.solution[5]
    game.press(cell, 0)
    game.press(cell, 50)
    const { delays } = game.placement.value!
    expect(delays.size).toBeGreaterThanOrEqual(20)
    const sfx = await fresh()
    sfx.wave(delays, 'cat')
    const plinks = FakeAudio.last.starts
    expect(plinks.length).toBeGreaterThan(9)
    expect(plinks.length).toBeLessThanOrEqual(14)
    const xTimes = new Set(delays.values())
    for (const p of plinks) expect(xTimes.has(since(p.at))).toBe(true)
    // Test cats plink an octave lower, on a plain sine.
    FakeAudio.last.starts = []
    sfx.wave(delays, 'test')
    expect(FakeAudio.last.starts.map((p) => p.freq)).toEqual(plinks.map((p) => p.freq! / 2))
    expect(FakeAudio.last.starts.every((p) => p.type === 'sine')).toBe(true)
  })

  it('never creates an AudioContext with sound off', async () => {
    const sfx = await fresh(false)
    sfx.unlock()
    sfx.x()
    sfx.lift()
    sfx.drag(3)
    sfx.erase()
    sfx.ghost()
    sfx.cat(213)
    sfx.wave(new Map([[1, 0]]), 'cat')
    sfx.intro(21, 28)
    sfx.clear()
    sfx.wrong()
    sfx.contradiction()
    sfx.refute()
    sfx.proof()
    sfx.blocked()
    sfx.hint()
    sfx.mouse()
    sfx.ui()
    sfx.undo()
    sfx.win()
    sfx.lose()
    sfx.star(0)
    expect(FakeAudio.made).toBe(0)
  })

  it('cracks the heart 650ms after the bonk of a wrong cat', async () => {
    const sfx = await fresh()
    sfx.wrong()
    const at = FakeAudio.last.starts.map((s) => since(s.at))
    expect(at.filter((ms) => ms < 100).length).toBeGreaterThan(0)
    expect(FakeAudio.last.starts.filter((s) => since(s.at) === 650).map((s) => s.kind).sort()).toEqual(['noise', 'tone'])
  })

  it("scratches once per XMark stroke, and a double-tap silences the stroke that's never drawn", async () => {
    const sfx = await fresh()
    sfx.x()
    expect(FakeAudio.last.starts.map((s) => since(s.at))).toEqual([0, 120])
    sfx.lift()
    const second = FakeAudio.last.starts[1]
    expect(second.stoppedAt).toBeLessThan(second.at)
  })

  it('plinks the intro on its 28ms diagonal steps, rising', async () => {
    const sfx = await fresh()
    sfx.intro(21, 28)
    const plinks = FakeAudio.last.starts
    expect(plinks).toHaveLength(21)
    for (const p of plinks) expect(since(p.at) % 28).toBe(0)
    const freqs = plinks.map((p) => p.freq!)
    expect(freqs).toEqual([...freqs].sort((a, b) => a - b))
  })

  it('schedules on the audio clock, never with timers', async () => {
    const { default: source } = await import('./sfx.ts?raw')
    expect(source).not.toMatch(/setTimeout|setInterval/)
  })
})
