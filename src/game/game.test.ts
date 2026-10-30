import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyStep, buildGroups, CAT, nextStep, OPEN, OUT, solveLogically, type CellState } from './logic'
import { bandForLevel, PACK_SIZE, sizeForLevel } from './levels'
import { packedLevel, packLength } from '../levels/pack'
import { catPoints, HINT_STEP_MS, HINT_WAVE_START_MS, hintWave, useGame } from './useGame'
import { generatePuzzle } from './generator'
import { blockedBy, conflictingCats, isSolutionCell, isSolved } from './rules'
import { cellCenter, groupOutline, outlineLength } from './outline'
import { basicsTarget, ghostTarget } from './coach'
import { countSolutions, solve } from './solver'
import { currentStreak, defaultProgress, progress, rewardLevel } from './progress'
import { REGION_COLORS, REGION_PATTERNS } from './palette'
import { tf, tp } from '../i18n'
import { refutable } from './hypothesis'
import type { InkLayer, Mark, PenMark } from './types'

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

  it('a double-tap on a cell a real cat rules out is a slip: no fish, the X stays', () => {
    const game = useGame(puzzle)
    game.press(catCell(0), 0)
    game.press(catCell(0), 50)
    // Same row as the cat, crossed out by its wave: tap erases the X, the second tap would be a cat.
    const cell = wrongCell(0)
    expect(game.marks.value[cell]).toBe('x')
    game.press(cell, 1000)
    expect(game.marks.value[cell]).toBe('empty')
    expect(game.press(cell, 1050)).toBe('slip')
    expect(game.fish.value).toBe(3)
    expect(game.marks.value[cell]).toBe('x')
    expect(game.mistakes.value.has(cell)).toBe(false)
    expect(game.slip.value).toMatchObject({ cell, by: catCell(0) })
    // Its X is locked: undo can't take it away.
    game.undo()
    expect(game.marks.value[cell]).toBe('x')
  })

  it('a wrong cat that no real cat rules out still costs a fish', () => {
    const game = useGame(puzzle)
    game.press(catCell(0), 0)
    game.press(catCell(0), 50)
    const ruledOut = new Set(blockedBy(puzzle, catCell(0)))
    const cell = puzzle.regions
      .map((_, c) => c)
      .find((c) => !ruledOut.has(c) && c !== catCell(0) && puzzle.solution[Math.floor(c / 6)] !== c % 6)!
    expect(game.press(cell, 1000)).toBe('x')
    expect(game.press(cell, 1050)).toBe('mistake')
    expect(game.fish.value).toBe(2)
    expect(game.slip.value).toBe(null)
  })

  it('the clock stops while paused: cat points ignore time in the background', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1_000_000)
      const game = useGame(puzzle)
      vi.advanceTimersByTime(20_000)
      expect(game.elapsed()).toBe(20_000)
      const points = catPoints(6, game.elapsed())
      game.pause()
      vi.advanceTimersByTime(60_000)
      game.resume()
      expect(game.elapsed()).toBe(20_000)
      game.press(catCell(0))
      game.press(catCell(0))
      expect(game.placement.value!.points).toBe(points)
      expect(game.saveState().elapsedMs).toBe(20_000)
      // Pausing twice, or resuming a running clock, changes nothing.
      game.pause()
      game.pause()
      vi.advanceTimersByTime(5000)
      game.resume()
      game.resume()
      vi.advanceTimersByTime(1000)
      expect(game.elapsed()).toBe(21_000)
    } finally {
      vi.useRealTimers()
    }
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

describe('rewards', () => {
  it('grants a bulb every level, a cat every 3rd and a mouse every 5th, and says which', () => {
    const before = { ...progress.powerUps }
    expect(rewardLevel(15)).toEqual(['bulb', 'cat', 'mouse'])
    expect(rewardLevel(3)).toEqual(['bulb', 'cat'])
    expect(rewardLevel(7)).toEqual(['bulb'])
    expect(progress.powerUps).toEqual({ bulb: before.bulb + 3, cat: before.cat + 2, mouse: before.mouse + 1 })
  })
})

describe('daily streak', () => {
  it('shows the streak only while it is alive (today or yesterday)', () => {
    const now = new Date('2026-10-30T12:00:00Z')
    progress.daily = { last: '2026-10-30', streak: 4 }
    expect(currentStreak(now)).toBe(4)
    progress.daily = { last: '2026-10-29', streak: 4 }
    expect(currentStreak(now)).toBe(4)
    progress.daily = { last: '2026-10-20', streak: 9 }
    expect(currentStreak(now)).toBe(0)
    progress.daily = { last: '', streak: 0 }
  })
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
    // A red X is paid for: a tap is blocked, and a double-tap can't cost another fish.
    expect(game.press(wrongCell(0), 10_000)).toBe('blocked')
    expect(game.press(wrongCell(0), 10_050)).toBe('blocked')
    expect(game.mistakes.value.has(wrongCell(0))).toBe(true)
    expect(game.fish.value).toBe(3)
    // Nor does an erasing drag that passes over it.
    const empty = game.marks.value.findIndex((m) => m === 'empty')
    game.press(empty, 20_000)
    game.press(empty, 21_000)
    game.drag(wrongCell(0))
    expect(game.marks.value[wrongCell(0)]).toBe('x')
    expect(game.mistakes.value.has(wrongCell(0))).toBe(true)
  })

  it('a tap then a held press that drags is a stroke, not a cat', () => {
    const game = useGame(puzzle)
    const start = wrongCell(2)
    game.press(start, 1000) // first tap: an X
    game.release()
    // The board held the second press; it moved to another cell, so it's a stroke.
    game.stroke(start)
    const next = start + 10 < 100 && game.marks.value[start + 10] === 'empty' ? start + 10 : start - 10
    game.drag(next)
    expect(game.fish.value).toBe(3)
    expect(game.marks.value[start]).toBe('x')
    expect(game.marks.value[next]).toBe('x')
    expect(game.mistakes.value.size).toBe(0)
  })

  it("a tap on a wave X that hasn't been drawn yet confirms it instead of erasing it", () => {
    const game = useGame(puzzle)
    const t = Date.now()
    game.press(catCell(4), t)
    game.press(catCell(4), t + 50)
    const p = game.placement.value!
    // The farthest X of the wave shows last: still on its way a moment later.
    const [far] = [...p.delays].sort((a, b) => b[1] - a[1])[0]
    expect(game.marks.value[far]).toBe('x')
    expect(game.press(far, t + 100)).toBe('x')
    expect(game.marks.value[far]).toBe('x')
    // Once it has shown, a tap erases it as usual.
    game.release()
    expect(game.press(far, t + 100 + 10_000)).toBe('erase')
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

  it('a guess that already fails stays refutable when an unrelated test cat follows it', () => {
    const n = size * size
    const pen: PenMark[] = new Array(n).fill('empty')
    const layerWith = (cells: number[]): InkLayer => {
      const layer: InkLayer = { mark: new Array(n).fill('empty'), auto: new Array(n).fill(false), seq: new Array(n).fill(0) }
      cells.forEach((c, i) => {
        layer.mark[c] = 'ghost'
        layer.seq[c] = i + 1
      })
      return layer
    }
    // A guess the pen alone refutes, then a second test cat far from it that nothing forces.
    const guess = [...Array(n).keys()].find((c) => refutable(puzzle, pen, layerWith([c])) !== null)!
    const far = [...Array(n).keys()].find(
      (c) => Math.abs(Math.floor(c / size) - Math.floor(guess / size)) > 2 && Math.abs((c % size) - (guess % size)) > 2,
    )!
    expect(refutable(puzzle, pen, layerWith([guess, far]))).toBe(guess)
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

describe('purr streak (cosmetic)', () => {
  const puzzle = generatePuzzle(8, 31)
  const size = 8
  const catCell = (row: number) => row * size + puzzle.solution[row]
  type Game = ReturnType<typeof useGame>
  let clock = 0
  const tapTwice = (game: Game, cell: number) => {
    game.press(cell, (clock += 1000))
    const outcome = game.press(cell, clock + 50)
    game.release()
    return outcome
  }
  /** A wrong cell no cat rules out yet, so a double-tap there is a real mistake. */
  const wrongCell = (game: Game) =>
    game.marks.value.findIndex(
      (m, c) => m === 'empty' && !isSolutionCell(puzzle, c) && blockedBy(puzzle, c).every((b) => game.marks.value[b] !== 'cat'),
    )

  afterEach(() => vi.useRealTimers())

  it('counts correct cats in a row, resets on a mistake, ignores revealed and test cats', () => {
    const game = useGame(puzzle)
    for (const row of [0, 1, 2]) expect(tapTwice(game, catCell(row))).toBe('cat')
    expect(game.streak.value).toBe(3)
    expect(game.placement.value?.streak).toBe(3)
    // A test cat and the cat power-up leave it as it is.
    game.setInk(1)
    expect(tapTwice(game, catCell(5))).toBe('ghost')
    expect(game.placement.value?.streak).toBe(0)
    game.setInk(0)
    expect(game.streak.value).toBe(3)
    game.revealCat()
    expect(game.placement.value).toMatchObject({ kind: 'cat', points: 0, streak: 0 })
    expect(game.streak.value).toBe(3)
    expect(tapTwice(game, wrongCell(game))).toBe('mistake')
    expect(game.streak.value).toBe(0)
    expect(tapTwice(game, catCell(3) === game.placement.value?.cell ? catCell(4) : catCell(3))).toBe('cat')
    expect(game.streak.value).toBe(1)
  })

  it('a kept test cat is a correct cat too', () => {
    const game = useGame(puzzle)
    tapTwice(game, catCell(0))
    game.setInk(2)
    tapTwice(game, catCell(4))
    expect(game.keepInk(2)).toBe(true)
    expect(game.marks.value[catCell(4)]).toBe('cat')
    expect(game.streak.value).toBe(2)
  })

  it('never changes the score', () => {
    vi.useFakeTimers({ now: 0 })
    /** Every cat at the same moment of the game, so each one pays the same. */
    const at50 = (game: Game, cell: number) => {
      game.press(cell, 0)
      return game.press(cell, 50)
    }
    const withStreak = useGame(puzzle)
    const broken = useGame(puzzle)
    for (const row of [0, 1, 2]) at50(withStreak, catCell(row))
    for (const row of [0, 1, 2]) {
      if (row > 0) expect(at50(broken, wrongCell(broken))).toBe('mistake')
      at50(broken, catCell(row))
    }
    expect(withStreak.streak.value).toBe(3)
    expect(broken.streak.value).toBe(1)
    expect(withStreak.score.value).toBe(3 * catPoints(size, 50))
    expect(broken.score.value).toBe(withStreak.score.value)
  })
})

describe('calm mode', () => {
  const puzzle = generatePuzzle(8, 31)
  const catCell = (row: number) => row * 8 + puzzle.solution[row]

  it('draws every X of a wave at once, for real and test cats', () => {
    const game = useGame(puzzle, { calm: () => true })
    game.press(catCell(3), 0)
    game.press(catCell(3), 50)
    const real = game.placement.value!
    expect(real.delays.size).toBeGreaterThan(5)
    expect(new Set(real.delays.values())).toEqual(new Set([0]))
    game.setInk(1)
    game.press(catCell(6), 5000)
    game.press(catCell(6), 5050)
    expect(new Set(game.placement.value!.delays.values())).toEqual(new Set([0]))
  })

  it('a hint crosses out all at once', () => {
    const delays = hintWave(8, [1, 2, 3, 9], [10, 11])
    expect(new Set(delays.values()).size).toBe(4)
    expect(new Set(hintWave(8, [1, 2, 3, 9], [10, 11], true).values())).toEqual(new Set([0]))
  })

  it('starts on when the system asks for less motion; patterns start off', async () => {
    expect(defaultProgress().settings).toMatchObject({ calm: false, patterns: false })
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)' }))
    try {
      expect(defaultProgress().settings.calm).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('region patterns', () => {
  it('one per region: red plain, the others distinct white tiles at 22%', () => {
    expect(REGION_PATTERNS).toHaveLength(REGION_COLORS.length)
    expect(REGION_PATTERNS[0]).toBe('none')
    const rest = REGION_PATTERNS.slice(1)
    expect(new Set(rest).size).toBe(rest.length)
    for (const p of rest) {
      const svg = decodeURIComponent(p.slice('url("data:image/svg+xml,'.length, -2))
      expect(svg).toMatch(/^<svg xmlns/)
      expect(svg).toContain(`fill='#fff' stroke='#fff' opacity='0.22'`)
    }
  })
})

describe('i18n', () => {
  it('fills placeholders, in the player language', () => {
    const lang = progress.lang
    try {
      progress.lang = 'ar'
      expect(tf('cellX', { r: 3, c: 5 })).toBe('صف 3، عمود 5: ×')
      expect(tp('regionOpen', 4, { n: 7, k: 4 })).toBe('المنطقة 7: 4 خانات مفتوحة')
      expect(tp('regionOpen', 2, { n: 7, k: 2 })).toBe('المنطقة 7: خانتان مفتوحتان')
      expect(tp('regionOpen', 11, { n: 7, k: 11 })).toBe('المنطقة 7: 11 خانة مفتوحة')
      progress.lang = 'en'
      expect(tf('cellX', { r: 3, c: 5 })).toBe('Row 3, column 5: ×')
      expect(tf('cellX', { r: 3 })).toBe('Row 3, column {c}: ×')
      expect(tp('regionOpen', 1, { n: 7, k: 1 })).toBe('Region 7: 1 open cell')
      expect(tp('regionOpen', 5, { n: 7, k: 5 })).toBe('Region 7: 5 open cells')
    } finally {
      progress.lang = lang
    }
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

  it('suggests a first test cat that breaks at once, else one in the tightest open group', () => {
    const { rows, cols, regions } = buildGroups(6, puzzle.regions)
    const trial = (cell: number): InkLayer => {
      const layer: InkLayer = { mark: new Array(36).fill('empty'), auto: new Array(36).fill(false), seq: new Array(36).fill(0) }
      layer.mark[cell] = 'ghost'
      layer.seq[cell] = 1
      return layer
    }
    const check = (view: Mark[]) => {
      const pen = view as PenMark[]
      const groups = [...rows, ...cols, ...regions].filter((g) => !g.some((c) => view[c] === 'cat'))
      const openIn = (g: number[]) => g.filter((c) => view[c] === 'empty').length
      const counts = groups.map(openIn).filter((n) => n > 0)
      const fewest = Math.min(...counts.filter((n) => n > 1), Infinity)
      const cell = ghostTarget(puzzle, view, pen)!
      expect(view[cell]).toBe('empty')
      const open = groups.flatMap((g) => g.filter((c) => view[c] === 'empty'))
      if (open.some((c) => refutable(puzzle, pen, trial(c)) !== null)) {
        expect(refutable(puzzle, pen, trial(cell))).not.toBeNull()
      } else {
        expect(groups.some((g) => g.includes(cell) && openIn(g) === (fewest === Infinity ? 1 : fewest))).toBe(true)
      }
    }
    const view: Mark[] = new Array(36).fill('empty')
    check(view)
    // Row 0 down to two open cells: the tightest spot worth a test.
    for (let c = 2; c < 6; c++) view[c] = 'x'
    check(view)
    view[0] = 'cat'
    check(view)
    expect(ghostTarget(puzzle, new Array(36).fill('x'), new Array(36).fill('x'))).toBeNull()
  })

  it('never coaches level 6 towards a wrong test cat that holds (the "Keep" trap)', () => {
    const level6 = packedLevel(6)!
    const n = level6.size ** 2
    const pen: PenMark[] = new Array(n).fill('empty')
    const cell = ghostTarget(level6, pen, pen)!
    const layer: InkLayer = { mark: new Array(n).fill('empty'), auto: new Array(n).fill(false), seq: new Array(n).fill(0) }
    layer.mark[cell] = 'ghost'
    layer.seq[cell] = 1
    expect(refutable(level6, pen, layer)).toBe(cell)
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
    sfx.cat(213, 4)
    sfx.ting(500)
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
    sfx.win(9, 600, 90)
    sfx.bloop()
    sfx.pop()
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

  it('plays one rising note per row of hopping cats, as each row takes off', async () => {
    const sfx = await fresh()
    sfx.win(7, 600, 90)
    const notes = FakeAudio.last.starts
    expect(notes.map((n) => since(n.at))).toEqual([600, 690, 780, 870, 960, 1050, 1140])
    const freqs = notes.map((n) => n.freq!)
    expect(freqs).toEqual([...freqs].sort((a, b) => a - b))
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

  it('mews a whole tone higher for each cat in a row, up to five steps', async () => {
    const sfx = await fresh()
    const mew = (streak?: number) => {
      FakeAudio.last.starts = []
      sfx.cat(213, streak)
      return FakeAudio.last.starts[0].freq!
    }
    sfx.unlock()
    const base = mew()
    expect(mew(1)).toBe(base)
    expect(mew(0)).toBe(base)
    expect(mew(2)).toBeCloseTo(base * 2 ** (2 / 12))
    expect(mew(3)).toBeCloseTo(base * 2 ** (4 / 12))
    expect(mew(6)).toBeCloseTo(base * 2 ** (10 / 12))
    expect(mew(20)).toBeCloseTo(mew(6))
  })

  it('tings E6 and B6 as the first sparkle reaches the counter, and plinks a calm wave once', async () => {
    const sfx = await fresh()
    sfx.ting(500)
    expect(FakeAudio.last.starts.map((s) => [since(s.at), Math.round(s.freq!)])).toEqual([
      [500, 1319],
      [500, 1976],
    ])
    FakeAudio.last.starts = []
    sfx.wave(new Map([[1, 0], [2, 0], [3, 0]]), 'cat')
    expect(FakeAudio.last.starts).toHaveLength(1)
  })

  it('schedules on the audio clock, never with timers', async () => {
    const { default: source } = await import('./sfx.ts?raw')
    expect(source).not.toMatch(/setTimeout|setInterval/)
  })
})
