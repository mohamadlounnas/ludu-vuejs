import { computed, ref, shallowRef } from 'vue'
import { effective as effectiveOf, refutable as refutableOf } from './hypothesis'
import { CAT, nextStep, OPEN, OUT, type CellState, type Step, type Technique } from './logic'
import { blockedBy, conflictingCats, deadGroups, isSolutionCell, isSolved } from './rules'
import type { CellIndex, InkLayer, Mark, PenMark, Puzzle } from './types'

export const MAX_FISH = 3
export const DOUBLE_TAP_MS = 320
/** Time between two X marks of a real cat's auto-cross wave. */
export const WAVE_STEP_MS = 18
/** A test cat's wave is lighter and quicker. */
export const GHOST_STEP_MS = 14
export const MISTAKE_MS = 1100
/** A wrong cat's heart breaks (and a fish with it) this long after the tap. */
export const HEART_BREAK_MS = 650
/** Win: the cats start hopping this long after the last one, a row at a time. */
export const HOP_MS = 300
export const HOP_ROW_MS = 45
/** Ink 0 is the normal white pen; inks 1..3 are test colours for "what if" reasoning. */
export const INK_COUNT = 4
/** Keep commits a layer's test cats one at a time, this far apart. */
export const KEEP_STEP_MS = 140
/** A contradiction shows this long after the X that caused it starts drawing. */
export const REVEAL_MS = 140
/** A dropped cat hits its cell this long after it appears (38% into GameBoard's 0.56s `land`). */
export const LAND_IMPACT_MS = 213
/** The board builds itself one diagonal at a time, this far apart. */
export const INTRO_STEP_MS = 12
const HISTORY_LIMIT = 200

export type Status = 'playing' | 'won' | 'lost'

/** 0 is the pen, 1..3 the test layers. */
export type Slot = 0 | 1 | 2 | 3

/** What a tap or drag did, so the screen can pick its sound. */
export type PressOutcome = 'x' | 'erase' | 'ghost' | 'unghost' | 'cat' | 'mistake' | 'slip' | 'blocked' | 'none'

/**
 * One logged write, for undo. Values are `encode`d: pen '' | 'x' | 'x!'
 * (mistake) | 'c'; test '' | 'x' | 'xa' (auto) | 'g<seq>'.
 */
export interface Change {
  slot: Slot
  cell: CellIndex
  before: string
  after: string
}

export interface SavedBoard {
  /** Pen marks. Saves from before test layers also hold 'ghost'. */
  marks: Mark[]
  /** Test layers of inks 1..3. */
  layers?: InkLayer[]
  ghostSeq?: number
  /** Legacy (one mark per cell): the ink of each X / ghost. */
  ink?: number[]
  mistakes: CellIndex[]
  fish: number
  score: number
  continued: boolean
  elapsedMs: number
}

/** What the bulb points at: cells to look at (`target`) and the group that proves it (`reason`). */
export interface Hint {
  id: number
  technique: Technique
  /** The forced cat, when the step places one (it is only shown, never placed). */
  place?: CellIndex
  target: CellIndex[]
  reason: CellIndex[]
  /** The crossed-out cells and when (ms) their X starts drawing: a wave out from the reason. */
  delays: Map<CellIndex, number>
}

/** The bulb's spotlight stays this long, unless a tap sends it away first. */
export const HINT_MS = 4500
/** Hint X's start once the outline has drawn in, then follow each other this far apart. */
export const HINT_WAVE_START_MS = 180
export const HINT_STEP_MS = 20

/** A correct cat: what the board animates around it. */
export interface Placement {
  id: number
  /** A real cat, or a test cat placed with a test ink. */
  kind: 'cat' | 'ghost'
  ink: number
  cell: CellIndex
  points: number
  /** Correct cats in a row, this one included (0 for free and test cats): bigger feedback, never more points. */
  streak: number
  /** Auto-crossed cells and when (ms) their X starts drawing. */
  delays: Map<CellIndex, number>
  /** Line ends that get a "Clear!" label once the wave reaches them. */
  clears: { cell: CellIndex; delay: number }[]
}

/** A test cat cleared by a pen mark: the pen proved the guess wrong. */
export interface Refuted {
  id: number
  ink: number
  cell: CellIndex
  /** When (ms) to show it: as the wave reaches it, or once a tap can't become a double-tap. */
  delay: number
}

/** A whole test layer cleared (Erase, Cross out): marks sweep away from `from` (top-left by default). */
export interface Sweep {
  id: number
  ink: number
  from?: CellIndex
}

/** Auto X's that lost their test cat, in un-draw order, starting `delay` ms from now. */
export interface Erased {
  id: number
  cells: CellIndex[]
  delay: number
}

/** "Cross out" wrote a proven X on a refuted guess. */
export interface Proof {
  id: number
  cell: CellIndex
}

/**
 * A double-tap on a cell a real cat already rules out: a slip, not a guess.
 * It costs no fish; `by` is the cat that rules it out.
 */
export interface Slip {
  id: number
  cell: CellIndex
  by: CellIndex
}

/** Cells undo just put back. */
export interface Restored {
  id: number
  cells: CellIndex[]
}

/** One test layer checked against the pen. */
export interface InkContradiction {
  /** Groups with no room left (beyond the pen's own). */
  dead: CellIndex[][]
  /** Cats and test cats that touch or share a line. */
  clash: CellIndex[]
  /** The guess the pen plus this layer prove wrong (see hypothesis.ts). */
  refutable: CellIndex | null
}

export interface Contradictions {
  pen: { dead: CellIndex[][] }
  /** Inks 1..3 (null: the layer is empty). */
  inks: (InkContradiction | null)[]
  broken: Set<Slot>
}

/** Points for a cat: bigger boards pay more, and quick cats pay most. */
export function catPoints(size: number, elapsedMs: number): number {
  const speed = Math.min(1, Math.max(0.25, 1 - elapsedMs / 100_000))
  return Math.round(size * size * 6 * speed)
}

/** When a contradiction over `cells` shows: just after the last of their X's starts drawing. */
export function revealAt(cells: CellIndex[], delays: Map<CellIndex, number>): number {
  return Math.max(0, ...cells.map((c) => delays.get(c) ?? 0)) + REVEAL_MS
}

/**
 * Orders the cells a new cat rules out the way the original animates them:
 * the touching cells first, then the row and the column sweeping outward
 * from the cat, then whatever is left of its region. Only cells passing
 * `isOpen` get an X.
 */
function crossWave(
  puzzle: Puzzle,
  cat: CellIndex,
  isOpen: (cell: CellIndex) => boolean,
  stepMs: number,
): Pick<Placement, 'delays' | 'clears'> {
  const { size, regions } = puzzle
  const row = Math.floor(cat / size)
  const col = cat % size
  const rowOf = (c: CellIndex) => Math.floor(c / size)
  const colOf = (c: CellIndex) => c % size
  const open = blockedBy(puzzle, cat).filter(isOpen)

  const neighbours = open.filter((c) => Math.abs(rowOf(c) - row) <= 1 && Math.abs(colOf(c) - col) <= 1)
  const line = (inLine: (c: CellIndex) => boolean, dist: (c: CellIndex) => number) =>
    open.filter((c) => inLine(c) && !neighbours.includes(c)).sort((a, b) => dist(a) - dist(b))
  const rowCells = line((c) => rowOf(c) === row, (c) => Math.abs(colOf(c) - col))
  const colCells = line((c) => colOf(c) === col, (c) => Math.abs(rowOf(c) - row))
  const regionCells = open.filter(
    (c) => regions[c] === regions[cat] && rowOf(c) !== row && colOf(c) !== col && !neighbours.includes(c),
  )

  const delays = new Map<CellIndex, number>()
  const clears: Placement['clears'] = []
  let t = 0
  for (const phase of [neighbours, rowCells, colCells, regionCells]) {
    phase.forEach((c, i) => delays.set(c, t + i * stepMs))
    if (phase.length > 0) t += (phase.length + 1) * stepMs
  }
  // "Clear!" pops on the far end of the row and of the column.
  for (const cells of [rowCells, colCells]) {
    const last = cells.at(-1)
    if (last !== undefined) clears.push({ cell: last, delay: delays.get(last)! + 200 })
  }
  return { delays, clears }
}

/**
 * When each hint X draws: the cells nearest the middle of the group that
 * proves them go first, so the crossing-out spreads out from the reason.
 */
export function hintWave(size: number, eliminate: CellIndex[], reason: CellIndex[], calm = false): Map<CellIndex, number> {
  const mid = (axis: (c: CellIndex) => number) => reason.reduce((sum, c) => sum + axis(c), 0) / reason.length
  const rowOf = (c: CellIndex) => Math.floor(c / size)
  const colOf = (c: CellIndex) => c % size
  const [r0, c0] = [mid(rowOf), mid(colOf)]
  const dist = (c: CellIndex) => Math.hypot(rowOf(c) - r0, colOf(c) - c0)
  const order = [...eliminate].sort((a, b) => dist(a) - dist(b) || a - b)
  return new Map(order.map((c, i) => [c, calm ? 0 : HINT_WAVE_START_MS + i * HINT_STEP_MS]))
}

const emptyLayer = (cells: number): InkLayer => ({
  mark: new Array(cells).fill('empty'),
  auto: new Array(cells).fill(false),
  seq: new Array(cells).fill(0),
})

const copyLayer = (layer: InkLayer): InkLayer => ({ mark: [...layer.mark], auto: [...layer.auto], seq: [...layer.seq] })

/**
 * Board state for one puzzle, following Meowdoku's controls: tap toggles an
 * X, double-tap places a cat, dragging paints the first tap's mark across
 * cells. A cat on a wrong cell costs a fish and leaves a red X; a correct
 * cat scores points and crosses out every cell it rules out.
 *
 * Test inks keep "what if" marks in their own layers, apart from the pen.
 * A pen mark always wins: writing one clears every layer on that cell.
 *
 * `calm` (calm mode) draws every X of a wave at once instead.
 */
export const AUTO_CHECK_LEVELS = 5

export function useGame(initial: Puzzle, { calm = () => false, autoCheck = () => true }: { calm?: () => boolean; autoCheck?: () => boolean } = {}) {
  const puzzle = shallowRef(initial)
  /** The pen's marks: the player's real board. */
  const marks = ref<PenMark[]>([])
  /** Test layers by ink; index 0 (the pen) stays empty. */
  const layers = ref<InkLayer[]>([])
  const activeInk = ref(0)
  /** Test inks, most recently written first. */
  const inkOrder = ref<number[]>([])
  /** Undo entries: the changes one action made. */
  const history = shallowRef<Change[][]>([])
  const mistakes = ref(new Set<CellIndex>())
  const fish = ref(MAX_FISH)
  const score = ref(0)
  /** Correct cats in a row (cosmetic: it never changes the score). */
  const streak = ref(0)
  const continued = ref(false)
  const mistakeCell = ref<CellIndex | null>(null)
  const placement = shallowRef<Placement | null>(null)
  const hinted = shallowRef<Hint | null>(null)
  const refuted = shallowRef<Refuted | null>(null)
  const sweep = shallowRef<Sweep | null>(null)
  const erased = shallowRef<Erased | null>(null)
  const proof = shallowRef<Proof | null>(null)
  const restored = shallowRef<Restored | null>(null)
  const slip = shallowRef<Slip | null>(null)
  /** Keep is placing a layer's test cats for real: taps wait. */
  const committing = ref(false)
  /** Changes on every (re)start, so views can replay their intro animations. */
  const round = ref(0)

  /** Play time banked before the current stretch; the clock stops while the app is in the background. */
  let activeMs = 0
  /** When the current stretch started (null: paused). */
  let runningSince: number | null = Date.now()
  let lastTap = { cell: -1, time: 0 }
  /**
   * Wave X's still on their way: when (same clock as `press`) each one shows.
   * Until then the cell looks empty, so a tap there means "X", not "erase".
   */
  const pendingUntil = new Map<CellIndex, number>()
  /** What a drag paints: the first tap's mark, in the first tap's ink. */
  let paint: { ink: number; code: '' | 'x' } | null = null
  let ghostSeq = 0
  let fxId = 0
  /** The undo entry being recorded (null: writes are locked, never undone). */
  let entry: Change[] | null = null
  /** The first tap's entry, which the second tap of a double-tap joins. */
  let tapEntry: Change[] = []
  /** Test cats cleared by pen marks during the current action. */
  let overruled: { ink: number; cell: CellIndex; at: number }[] = []
  let keepTimer: ReturnType<typeof setTimeout> | undefined

  const load = (next: Puzzle) => {
    clearTimeout(keepTimer)
    puzzle.value = next
    marks.value = new Array<PenMark>(next.size ** 2).fill('empty')
    layers.value = Array.from({ length: INK_COUNT }, () => emptyLayer(next.size ** 2))
    activeInk.value = 0
    inkOrder.value = []
    history.value = []
    mistakes.value = new Set()
    fish.value = MAX_FISH
    score.value = 0
    streak.value = 0
    continued.value = false
    mistakeCell.value = null
    placement.value = null
    hinted.value = null
    refuted.value = sweep.value = erased.value = proof.value = restored.value = slip.value = null
    committing.value = false
    round.value++
    activeMs = 0
    if (runningSince !== null) runningSince = Date.now()
    lastTap = { cell: -1, time: 0 }
    pendingUntil.clear()
    paint = null
    ghostSeq = 0
    entry = null
    overruled = []
  }
  load(initial)

  const status = computed<Status>(() =>
    fish.value <= 0 ? 'lost' : isSolved(puzzle.value, marks.value) ? 'won' : 'playing',
  )

  const catRegions = computed(
    () => new Set(marks.value.flatMap((m, i) => (m === 'cat' ? [puzzle.value.regions[i]] : []))),
  )

  const catsLeft = computed(() => puzzle.value.size - marks.value.filter((m) => m === 'cat').length)

  /** How many marks each test layer holds (index 0, the pen, is always 0). */
  const inkUse = computed(() =>
    layers.value.map((layer, k) => (k === 0 ? 0 : layer.mark.filter((m) => m !== 'empty').length)),
  )

  /** The last test ink written to that still has marks. */
  const lastTestInk = computed(() => inkOrder.value.find((k) => inkUse.value[k] > 0) ?? 0)

  /** The test layer the board shows in full (the others show as corner pips). */
  const focusInk = computed(() => (activeInk.value > 0 ? activeInk.value : lastTestInk.value))

  /** The pen plus test layer `k`, as rules.ts sees a board. */
  const effective = (k: number): Mark[] => (k === 0 ? [...marks.value] : effectiveOf(marks.value, layers.value[k]))

  /** Regions holding a test cat of the focus layer, with its ink (for the cat-head strip). */
  const ghostRegions = computed(() => {
    const k = focusInk.value
    if (k === 0) return new Map<number, number>()
    return new Map(layers.value[k].mark.flatMap((m, i) => (m === 'ghost' ? [[puzzle.value.regions[i], k] as const] : [])))
  })

  /**
   * Broken "what if"s, from the player's own marks only (never the
   * solution): groups with no room left for a cat, and cats that touch or
   * share a line. Each test layer is checked against the pen on its own;
   * `refutable` is its guess when the pen plus that guess alone prove it wrong.
   */
  const contradictions = computed<Contradictions>(() => {
    const p = puzzle.value
    const penDead = deadGroups(p, marks.value)
    const penKeys = new Set(penDead.map((g) => g.join()))
    const inks = ([1, 2, 3] as const).map((k): InkContradiction | null => {
      if (inkUse.value[k] === 0) return null
      const view = effective(k)
      return {
        dead: deadGroups(p, view).filter((g) => !penKeys.has(g.join())),
        clash: [...conflictingCats(p, view)],
        refutable: refutableOf(p, marks.value, layers.value[k]),
      }
    })
    const broken = new Set<Slot>()
    if (penDead.length > 0) broken.add(0)
    inks.forEach((c, i) => c && c.dead.length + c.clash.length > 0 && broken.add((i + 1) as Slot))
    return { pen: { dead: penDead }, inks, broken }
  })

  const refutable = (k: number): CellIndex | null => contradictions.value.inks[k - 1]?.refutable ?? null

  // ---- Writes: every change goes through `write`, so undo can log it ----

  const encode = (slot: Slot, cell: CellIndex): string => {
    if (slot === 0) {
      const m = marks.value[cell]
      return m === 'empty' ? '' : m === 'cat' ? 'c' : mistakes.value.has(cell) ? 'x!' : 'x'
    }
    const layer = layers.value[slot]
    const m = layer.mark[cell]
    return m === 'empty' ? '' : m === 'ghost' ? `g${layer.seq[cell]}` : layer.auto[cell] ? 'xa' : 'x'
  }

  const decode = (slot: Slot, cell: CellIndex, code: string) => {
    if (slot === 0) {
      marks.value[cell] = code === '' ? 'empty' : code === 'c' ? 'cat' : 'x'
      if (code === 'x!') mistakes.value.add(cell)
      else mistakes.value.delete(cell)
      return
    }
    const layer = layers.value[slot]
    layer.mark[cell] = code === '' ? 'empty' : code[0] === 'g' ? 'ghost' : 'x'
    layer.auto[cell] = code === 'xa'
    layer.seq[cell] = code[0] === 'g' ? Number(code.slice(1)) : 0
  }

  const write = (slot: Slot, cell: CellIndex, code: string) => {
    const before = encode(slot, cell)
    if (before === code) return
    decode(slot, cell, code)
    entry?.push({ slot, cell, before, after: code })
  }

  const testSlots = [1, 2, 3] as const

  /**
   * Writes the pen. A pen mark clears every test layer on its cell; a test
   * cat cleared that way is overruled (see `settle`). `at` is when the mark
   * shows on the board (its wave delay).
   */
  const writePen = (cell: CellIndex, code: '' | 'x' | 'x!' | 'c', at = 0) => {
    pendingUntil.delete(cell)
    if (code !== '') {
      for (const k of testSlots) {
        if (layers.value[k].mark[cell] === 'ghost') overruled.push({ ink: k, cell, at })
        write(k, cell, '')
      }
    }
    write(0, cell, code)
  }

  /** Marks `k` as the test ink written to last. */
  const touch = (k: number) => {
    if (k > 0) inkOrder.value = [k, ...inkOrder.value.filter((i) => i !== k)]
  }

  /**
   * Clears the auto X's of layer `k` that no remaining test cat of that layer
   * rules out, in reverse wave order from the test cat at `from`.
   */
  const clearStale = (k: Slot, from: CellIndex): CellIndex[] => {
    const layer = layers.value[k]
    const cats = layer.mark.flatMap((m, i) => (m === 'ghost' ? [new Set(blockedBy(puzzle.value, i))] : []))
    const stale = layer.mark.flatMap((m, c) => (m === 'x' && layer.auto[c] && !cats.some((b) => b.has(c)) ? [c] : []))
    const order = crossWave(puzzle.value, from, () => true, GHOST_STEP_MS).delays
    stale.sort((a, b) => (order.get(b) ?? 0) - (order.get(a) ?? 0))
    for (const c of stale) write(k, c, '')
    return stale
  }

  /**
   * Ends an action: the auto X's of overruled test cats go, and the first
   * overruled cat is published. `minDelay` holds a tap's verdict back until
   * it can no longer turn into a double-tap.
   */
  const settle = (minDelay = 0) => {
    if (overruled.length === 0) return
    const list = overruled
    overruled = []
    const cells = list.flatMap((o) => clearStale(o.ink as Slot, o.cell))
    const delay = Math.max(minDelay, list[0].at)
    publishErased(cells, delay)
    refuted.value = { id: ++fxId, ink: list[0].ink, cell: list[0].cell, delay }
  }

  /** Publishes auto X's to un-draw, joining any published by the same action. */
  let erasedNow: Erased | null = null
  const publishErased = (cells: CellIndex[], delay: number) => {
    if (cells.length === 0) return
    if (erasedNow) cells = [...erasedNow.cells, ...cells]
    else queueMicrotask(() => (erasedNow = null))
    erasedNow = erased.value = { id: ++fxId, cells, delay: erasedNow?.delay ?? delay }
  }

  /** Runs `fn` as one undoable entry. */
  const logged = <T>(fn: () => T): T => {
    release()
    entry = []
    try {
      return fn()
    } finally {
      release()
    }
  }

  /** Runs `fn` with writes that undo never takes back (real cats, power-ups). */
  const locked = <T>(fn: () => T): T => {
    const open = entry
    entry = null
    try {
      return fn()
    } finally {
      entry = open
    }
  }

  /** Closes the open undo entry (the board calls it when the finger lifts). */
  const release = () => {
    if (entry && entry.length > 0 && history.value.at(-1) !== entry) {
      history.value = [...history.value, entry].slice(-HISTORY_LIMIT)
    }
    entry = null
  }

  // ---- Clock: only time spent in front of the board counts ----

  /** Play time so far (ms), without the time spent paused. */
  const elapsed = (now = Date.now()) => activeMs + (runningSince === null ? 0 : now - runningSince)

  /** Stops the clock (the app went to the background). */
  const pause = (now = Date.now()) => {
    if (runningSince === null) return
    activeMs = elapsed(now)
    runningSince = null
  }

  const resume = (now = Date.now()) => {
    if (runningSince === null) runningSince = now
  }

  // ---- Cats: real ones and test ones ----

  /** Time between two X's of a wave: none in calm mode. */
  const waveStep = (ms: number) => (calm() ? 0 : ms)

  const placeCat = (cell: CellIndex, points: number, free: boolean, now = Date.now()) => {
    const wave = crossWave(puzzle.value, cell, (c) => autoCheck() && marks.value[c] === 'empty', waveStep(WAVE_STEP_MS))
    writePen(cell, 'c')
    for (const [c, at] of wave.delays) {
      writePen(c, 'x', at)
      pendingUntil.set(c, now + at)
    }
    score.value += points
    if (!free) streak.value++
    placement.value = { id: ++fxId, kind: 'cat', ink: 0, cell, points, streak: free ? 0 : streak.value, ...wave }
  }

  /**
   * The real cat that already rules `cell` out, the nearest if several do.
   * Real cats are always right, so this reads the board, never the solution.
   */
  const ruledOutBy = (cell: CellIndex): CellIndex | undefined => {
    const { size } = puzzle.value
    const dist = (c: CellIndex) => Math.hypot(Math.floor(c / size) - Math.floor(cell / size), (c % size) - (cell % size))
    return blockedBy(puzzle.value, cell)
      .filter((c) => marks.value[c] === 'cat')
      .sort((a, b) => dist(a) - dist(b))[0]
  }

  /**
   * A real cat attempt (locked). Test cats on the cell make way first. A
   * cell a real cat already rules out is a slip (usually a double-tap on an
   * auto X): it keeps its X and costs nothing.
   */
  const tryCat = (cell: CellIndex, now: number, free = false): PressOutcome => {
    const moved = testSlots.filter((k) => layers.value[k].mark[cell] === 'ghost')
    for (const k of moved) write(k, cell, '')
    const by = ruledOutBy(cell)
    let outcome: PressOutcome
    if (by !== undefined) {
      writePen(cell, 'x')
      slip.value = { id: ++fxId, cell, by }
      outcome = 'slip'
    } else if (isSolutionCell(puzzle.value, cell)) {
      placeCat(cell, free ? 0 : catPoints(puzzle.value.size, elapsed(now)), free, now)
      outcome = 'cat'
    } else {
      fish.value--
      streak.value = 0
      writePen(cell, 'x!')
      mistakeCell.value = cell
      setTimeout(() => mistakeCell.value === cell && (mistakeCell.value = null), MISTAKE_MS)
      outcome = 'mistake'
    }
    // A real cat re-crossed their X's; otherwise they have no cat left.
    publishErased(moved.flatMap((k) => clearStale(k, cell)), 0)
    return outcome
  }

  /** A test cat: free, and it crosses out what it would rule out, in its own layer. */
  const placeGhost = (k: Slot, cell: CellIndex) => {
    const layer = layers.value[k]
    const isOpen = (c: CellIndex) => autoCheck() && marks.value[c] === 'empty' && layer.mark[c] === 'empty'
    const wave = crossWave(puzzle.value, cell, isOpen, waveStep(GHOST_STEP_MS))
    write(k, cell, `g${++ghostSeq}`)
    for (const c of wave.delays.keys()) write(k, c, 'xa')
    touch(k)
    placement.value = { id: ++fxId, kind: 'ghost', ink: k, cell, points: 0, streak: 0, ...wave }
  }

  /** Takes a test cat back, with the auto X's only it was responsible for. */
  const removeGhost = (k: Slot, cell: CellIndex) => {
    write(k, cell, '')
    publishErased(clearStale(k, cell), 0)
  }

  // ---- Input ----

  const press = (cell: CellIndex, now = Date.now()): PressOutcome => {
    // Any tap sends the bulb's spotlight away: it never stands in the way.
    hinted.value = null
    if (status.value !== 'playing' || committing.value) return 'none'
    const double = lastTap.cell === cell && now - lastTap.time < DOUBLE_TAP_MS
    lastTap = { cell, time: double ? 0 : now }
    paint = null
    if (double) {
      entry = tapEntry
    } else {
      release()
      entry = tapEntry = []
    }
    const k = activeInk.value as Slot
    const pen = marks.value[cell]

    if (k === 0) {
      if (pen === 'cat') return 'none'
      // A red X is a fish already paid for: it stays, and it can't be tried again.
      if (mistakes.value.has(cell)) return 'blocked'
      if (double) {
        // The first tap's X was the start of this cat: its verdict on a test cat is moot.
        if (refuted.value?.cell === cell) refuted.value = null
        const outcome = locked(() => tryCat(cell, now))
        settle()
        return outcome
      }
      // An X still on its way with a wave looks empty: the tap confirms it (and a drag from here paints X's).
      if (pen === 'x' && (pendingUntil.get(cell) ?? -Infinity) > now) {
        pendingUntil.delete(cell)
        paint = { ink: 0, code: 'x' }
        return 'x'
      }
      paint = { ink: 0, code: pen === 'empty' ? 'x' : '' }
      writePen(cell, paint.code)
      settle(DOUBLE_TAP_MS)
      return paint.code ? 'x' : 'erase'
    }

    // Test inks never touch a pen mark.
    if (pen !== 'empty') return 'blocked'
    const mark = layers.value[k].mark[cell]
    if (double) {
      placeGhost(k, cell)
      return 'ghost'
    }
    if (mark === 'ghost') {
      removeGhost(k, cell)
      return 'unghost'
    }
    paint = { ink: k, code: mark === 'empty' ? 'x' : '' }
    write(k, cell, paint.code)
    touch(k)
    return paint.code ? 'x' : 'erase'
  }

  /**
   * A second press on the same cell that turned into a drag, not a double
   * tap: no cat. The stroke carries on what the first tap did there (an X,
   * or an erase), in the same ink.
   */
  const stroke = (cell: CellIndex): PressOutcome => {
    if (status.value !== 'playing' || committing.value) return 'none'
    lastTap = { cell: -1, time: 0 }
    release()
    entry = tapEntry = []
    const k = activeInk.value as Slot
    const mark = k === 0 ? marks.value[cell] : layers.value[k].mark[cell]
    paint = { ink: k, code: mark === 'x' ? 'x' : '' }
    return 'none'
  }

  /** Paints the first tap's mark, in its own layer only, never over a cat or a test cat. */
  const drag = (cell: CellIndex): PressOutcome => {
    if (status.value !== 'playing' || committing.value || !paint) return 'none'
    const pen = marks.value[cell]
    const { ink: k, code } = paint
    if (k === 0) {
      if (pen === 'cat' || mistakes.value.has(cell) || testSlots.some((i) => layers.value[i].mark[cell] === 'ghost')) return 'none'
      if (code === 'x' ? pen !== 'empty' : pen !== 'x') return 'none'
      writePen(cell, code)
      settle()
    } else {
      const mark = layers.value[k].mark[cell]
      if (pen !== 'empty' || mark === 'ghost') return 'none'
      if (code === 'x' ? mark !== 'empty' : mark !== 'x') return 'none'
      write(k as Slot, cell, code)
    }
    return code ? 'x' : 'erase'
  }

  const setInk = (inkIndex: number) => {
    if (status.value !== 'playing') return
    activeInk.value = Math.max(0, Math.min(INK_COUNT - 1, inkIndex))
  }

  // ---- Test ink actions ----

  /** Removes every mark of test ink `k` (1..3). */
  const eraseInk = (k: number): boolean => {
    if (status.value !== 'playing' || committing.value || k < 1 || k >= INK_COUNT || inkUse.value[k] === 0) return false
    logged(() => layers.value[k].mark.forEach((_, c) => write(k as Slot, c, '')))
    sweep.value = { id: ++fxId, ink: k }
    return true
  }

  /** The pen plus ink `k`'s guess ran into a wall: the guess becomes a proven pen X. */
  const crossOutGuess = (k: number): boolean => {
    const root = refutable(k)
    if (status.value !== 'playing' || committing.value || root === null) return false
    logged(() => {
      layers.value[k].mark.forEach((_, c) => write(k as Slot, c, ''))
      writePen(root, 'x')
    })
    settle()
    proof.value = { id: ++fxId, cell: root }
    sweep.value = { id: ++fxId, ink: k, from: root }
    return true
  }

  /**
   * The guess held: ink `k`'s hand-drawn X's become pen X's, then its test
   * cats are placed for real in the order they were tried, one by one. Auto
   * X's are left for the real cats to re-cross. A wrong cat costs a fish as
   * usual and ends the commit; the rest of the layer is wiped.
   */
  const keepInk = (k: number): boolean => {
    if (status.value !== 'playing' || committing.value || k < 1 || k >= INK_COUNT) return false
    if (inkUse.value[k] === 0 || contradictions.value.broken.has(k as Slot)) return false
    const layer = layers.value[k]
    logged(() => layer.mark.forEach((m, c) => m === 'x' && !layer.auto[c] && writePen(c, 'x')))
    settle()
    const cats = layer.mark.flatMap((m, c) => (m === 'ghost' ? [c] : [])).sort((a, b) => layer.seq[a] - layer.seq[b])
    const finish = () => {
      committing.value = false
      if (inkUse.value[k] === 0) return
      locked(() => layer.mark.forEach((_, c) => write(k as Slot, c, '')))
      sweep.value = { id: ++fxId, ink: k }
    }
    const commit = (i: number) => {
      if (i >= cats.length || status.value !== 'playing') return finish()
      const outcome = locked(() => tryCat(cats[i], Date.now()))
      settle()
      if (outcome !== 'cat') return finish()
      keepTimer = setTimeout(() => commit(i + 1), KEEP_STEP_MS)
    }
    committing.value = true
    commit(0)
    return true
  }

  /** Clears every test layer (locked) and puts the pen back in hand, e.g. once the board is won. */
  const clearTests = () => {
    locked(() => testSlots.forEach((k) => layers.value[k].mark.forEach((_, c) => write(k, c, ''))))
    activeInk.value = 0
  }

  // ---- Undo ----

  /** A change can go back if nothing overwrote it since, and the pen would still win. */
  const restorable = (ch: Change) => {
    if (encode(ch.slot, ch.cell) !== ch.after) return false
    if (ch.before === '') return true
    return ch.slot === 0
      ? testSlots.every((k) => layers.value[k].mark[ch.cell] === 'empty')
      : marks.value[ch.cell] === 'empty'
  }

  const canUndo = computed(() => history.value.some((changes) => changes.some(restorable)))

  /** Takes back the last entry that still has something to restore. */
  const undo = (): boolean => {
    if (status.value !== 'playing' || committing.value) return false
    release()
    const list = [...history.value]
    const cells: CellIndex[] = []
    while (list.length > 0 && cells.length === 0) {
      for (const ch of [...list.pop()!].reverse()) {
        if (!restorable(ch)) continue
        decode(ch.slot, ch.cell, ch.before)
        cells.push(ch.cell)
        if (ch.slot > 0 && ch.before !== '') touch(ch.slot)
      }
    }
    history.value = list
    lastTap = { cell: -1, time: 0 }
    pendingUntil.clear()
    paint = null
    if (cells.length === 0) return false
    restored.value = { id: ++fxId, cells: [...new Set(cells)] }
    return true
  }

  // ---- Power-ups (locked; they read the pen only) ----

  /** Cat power-up: places the cat of the most constrained unsolved region (no points). */
  const revealCat = (): boolean => {
    if (status.value !== 'playing' || committing.value) return false
    const { size, regions, solution } = puzzle.value
    const openCells = (region: number) =>
      regions.filter((r, i) => r === region && marks.value[i] === 'empty').length
    const target = solution
      .map((col, row) => row * size + col)
      .filter((cell) => marks.value[cell] !== 'cat')
      .sort((a, b) => openCells(regions[a]) - openCells(regions[b]))[0]
    if (target === undefined) return false
    locked(() => tryCat(target, Date.now(), true))
    settle()
    return true
  }

  /**
   * The next logical step from the pen alone (see logic.ts). X marks on real
   * cat cells are ignored, so neither test inks nor mistakes can mislead it:
   * every step it returns is proven.
   */
  const provenStep = (): Step | null => {
    const { size, regions } = puzzle.value
    const state: CellState[] = marks.value.map((m, i) =>
      m === 'cat' ? CAT : m === 'x' && !isSolutionCell(puzzle.value, i) ? OUT : OPEN,
    )
    return nextStep(size, regions, state)
  }

  /**
   * Bulb power-up: shows the next logical step. Eliminations are crossed out
   * in a wave from their reason, which is outlined; a forced cat is only
   * shown, so the player still places it.
   */
  const hint = (): boolean => {
    if (status.value !== 'playing' || committing.value) return false
    const step = provenStep()
    if (!step) return false
    const target = step.place !== undefined ? [step.place] : step.eliminate
    const delays = step.place !== undefined ? new Map<CellIndex, number>() : hintWave(puzzle.value.size, step.eliminate, step.reason, calm())
    if (step.place === undefined) {
      locked(() => delays.forEach((at, cell) => writePen(cell, 'x', at)))
      settle()
    }
    const id = ++fxId
    hinted.value = { id, technique: step.technique, place: step.place, target, reason: step.reason, delays }
    setTimeout(() => hinted.value?.id === id && (hinted.value = null), HINT_MS)
    return true
  }

  /** Mouse power-up: removes pen X marks wrongly placed on cells that hold a cat. */
  const clearMistakes = (): boolean => {
    if (status.value !== 'playing' || committing.value) return false
    const wrong = marks.value.flatMap((m, i) => (m === 'x' && isSolutionCell(puzzle.value, i) ? [i] : []))
    locked(() => wrong.forEach((cell) => writePen(cell, '')))
    return wrong.length > 0
  }

  // ---- Save and resume ----

  /** Everything needed to resume this board later (see `restore`). */
  const saveState = (): SavedBoard => ({
    marks: [...marks.value],
    layers: layers.value.slice(1).map(copyLayer),
    ghostSeq,
    mistakes: [...mistakes.value],
    fish: fish.value,
    score: score.value,
    continued: continued.value,
    elapsedMs: elapsed(),
  })

  /**
   * Puts a saved board back (same puzzle), keeping the elapsed time. Saves
   * from before test layers kept test marks among the pen's, coloured by
   * `ink`: those move into their layers (as hand-drawn X's and test cats).
   */
  const restore = (saved: SavedBoard) => {
    const cells = marks.value.length
    if (saved.marks.length !== cells) return
    pendingUntil.clear()
    const pen: PenMark[] = saved.marks.map((m) => (m === 'ghost' ? 'empty' : m))
    const next = Array.from({ length: INK_COUNT }, () => emptyLayer(cells))
    saved.layers?.slice(0, INK_COUNT - 1).forEach((layer, i) => (next[i + 1] = copyLayer(layer)))
    let seq = saved.ghostSeq ?? 0
    saved.ink?.forEach((k, c) => {
      const m = saved.marks[c]
      if (k < 1 || k >= INK_COUNT || (m !== 'x' && m !== 'ghost')) return
      pen[c] = 'empty'
      next[k].mark[c] = m
      if (m === 'ghost') next[k].seq[c] = ++seq
    })
    // The pen always wins.
    pen.forEach((m, c) => {
      if (m === 'empty') return
      for (const layer of next) {
        layer.mark[c] = 'empty'
        layer.auto[c] = false
        layer.seq[c] = 0
      }
    })
    marks.value = pen
    layers.value = next
    ghostSeq = seq
    inkOrder.value = testSlots.filter((k) => next[k].mark.some((m) => m !== 'empty'))
    mistakes.value = new Set(saved.mistakes)
    fish.value = saved.fish
    score.value = saved.score
    continued.value = saved.continued
    activeMs = saved.elapsedMs
    if (runningSince !== null) runningSince = Date.now()
  }

  /** "Get 3 fish" on the game-over screen: one refill per attempt. */
  const continueWithFish = (): boolean => {
    if (status.value !== 'lost' || continued.value) return false
    continued.value = true
    fish.value = MAX_FISH
    return true
  }

  return {
    puzzle,
    marks,
    layers,
    activeInk,
    focusInk,
    history,
    canUndo,
    inkUse,
    contradictions,
    refutable,
    effective,
    ghostRegions,
    mistakes,
    fish,
    score,
    streak,
    continued,
    mistakeCell,
    placement,
    hinted,
    refuted,
    sweep,
    erased,
    proof,
    restored,
    slip,
    committing,
    round,
    status,
    catRegions,
    catsLeft,
    load,
    elapsed,
    pause,
    resume,
    press,
    release,
    stroke,
    drag,
    revealCat,
    provenStep,
    hint,
    clearMistakes,
    continueWithFish,
    saveState,
    restore,
    setInk,
    eraseInk,
    crossOutGuess,
    keepInk,
    clearTests,
    undo,
  }
}
