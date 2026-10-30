<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { cellCenter, groupOutline, outlineLength } from '../game/outline'
import { INKS, REGION_COLORS, REGION_PATTERNS } from '../game/palette'
import { blockedBy } from '../game/rules'
import { sfx } from '../game/sfx'
import { tf } from '../i18n'
import type { InkLayer, PenMark, Puzzle } from '../game/types'
import {
  HEART_BREAK_MS,
  HOP_MS,
  INTRO_STEP_MS,
  LAND_IMPACT_MS,
  revealAt,
  type Contradictions,
  type Erased,
  type Hint,
  type Placement,
  type PressOutcome,
  type Proof,
  type Refuted,
  type Restored,
  type Slip,
  type Sweep,
} from '../game/useGame'
import BrokenHeart from './icons/BrokenHeart.vue'
import CatFace from './icons/CatFace.vue'
import CatSilhouette from './icons/CatSilhouette.vue'
import XMark from './icons/XMark.vue'

const props = defineProps<{
  puzzle: Puzzle
  marks: PenMark[]
  layers: InkLayer[]
  /** The test layer shown in full; the other layers show as corner pips. */
  focusInk: number
  penActive: boolean
  mistakes: Set<number>
  contradictions: Contradictions
  mistakeCell: number | null
  placement: Placement | null
  hinted: Hint | null
  sweep: Sweep | null
  erased: Erased | null
  refuted: Refuted | null
  proof: Proof | null
  restored: Restored | null
  slip: Slip | null
  /** What the last tap or drag did (a test ink on a pen mark wiggles the cell). */
  pressed: { id: number; cell: number; outcome: PressOutcome } | null
  /** Leaving for the next level: the cells go, the last to come in first. */
  outro?: boolean
  /** Won: the last cat's cell. The board clears out from it and its cats celebrate. */
  celebrate?: number | null
  /** Out of fish: the board greys out and its cats get sad, once the heart has broken. */
  dying?: boolean
  /** A region head was tapped: its cells light up for a moment, the rest dim. */
  spot?: { region: number; id: number } | null
  /** Calm mode: no ripples, shakes, hops or idle loops; X's appear whole. */
  calm?: boolean
  /** Each region wears its pattern over its colour. */
  patterns?: boolean
}>()

const emit = defineEmits<{ press: [cell: number]; drag: [cell: number]; release: []; left: []; pet: [cell: number] }>()

const cellCount = computed(() => props.puzzle.size ** 2)
const rowOf = (cell: number) => Math.floor(cell / props.puzzle.size)
const colOf = (cell: number) => cell % props.puzzle.size

// ---- Pointer input: tap, double-tap and drag-to-paint ----

let dragging = false
let lastCell = -1
/** The cell under the finger: it sinks in while held (`:active` is unreliable with touch on iOS). */
const pressing = ref<number | null>(null)
/** Cells painted by the current drag: their X's draw quicker, to keep up with the finger. */
const dragged = new Set<number>()

/** Cats watch the player's finger, then drift back to looking ahead. */
const watched = ref<number | null>(null)
let lookTimer = 0
const watch_ = (cell: number) => {
  watched.value = cell
  clearTimeout(lookTimer)
  lookTimer = window.setTimeout(() => (watched.value = null), 2400)
}
const lookAt = (cat: number) => {
  if (watched.value === null || watched.value === cat) return { x: 0, y: 0.15 }
  const dx = colOf(watched.value) - colOf(cat)
  const dy = rowOf(watched.value) - rowOf(cat)
  const len = Math.hypot(dx, dy)
  return { x: dx / len, y: dy / len }
}

// Pointer capture keeps events on the board, so find the cell under the finger.
const cellAt = (e: PointerEvent): number | null => {
  const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-cell]')
  return el ? Number(el.dataset.cell) : null
}

const onDown = (e: PointerEvent) => {
  sfx.unlock()
  const cell = cellAt(e)
  if (cell === null) return
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  dragging = true
  lastCell = cell
  pressing.value = cell
  dragged.clear()
  forget(cell)
  watch_(cell)
  if (views.value[cell]?.kind === 'cat' && views.value[cell]?.ink === 0) pet(cell)
  emit('press', cell)
}

// ---- Petting: tap a placed cat and it leans into it, with a few hearts ----

const pets = shallowRef(new Map<number, number>())
const pet = (cell: number) => {
  pets.value = new Map(pets.value).set(cell, (pets.value.get(cell) ?? 0) + 1)
  if (!props.calm) {
    addEffects(
      [0, 1, 2].map((n) => ({ id: nextId++, cell, kind: 'heart' as const, delay: n * 200, streak: n })),
      2300,
    )
  }
  emit('pet', cell)
}

const onMove = (e: PointerEvent) => {
  if (!dragging) return
  const cell = cellAt(e)
  if (cell === null || cell === lastCell) return
  lastCell = cell
  pressing.value = cell
  dragged.add(cell)
  forget(cell)
  watch_(cell)
  emit('drag', cell)
}

const onUp = () => {
  // Chrome counts a touch as a gesture that may start sound only when it lifts.
  sfx.unlock()
  dragging = false
  pressing.value = null
  dragged.clear()
  emit('release')
}

// ---- What each cell shows: the pen, else the focus layer, plus pips ----

type View = { kind: 'cat' | 'x' | 'ghost'; ink: number } | null

const views = computed<View[]>(() =>
  props.marks.map((pen, cell) => {
    if (pen !== 'empty') return { kind: pen, ink: 0 }
    const k = props.focusInk
    const mark = k > 0 ? props.layers[k].mark[cell] : 'empty'
    return mark === 'empty' ? null : { kind: mark, ink: k }
  }),
)

/** The other test layers, as small marks in each ink's own corner. */
const pips = computed(() =>
  props.marks.map((pen, cell) =>
    pen !== 'empty'
      ? []
      : [1, 2, 3].flatMap((k) => {
          const mark = props.layers[k].mark[cell]
          return k === props.focusInk || mark === 'empty' ? [] : [{ ink: k, kind: mark }]
        }),
  ),
)

/** Pips a real cat's wave has overruled stay until its X reaches them. */
const heldPips = shallowRef(new Map<number, { ink: number; kind: string }[]>())
let shownPips = pips.value
watch(pips, (now) => (shownPips = now), { flush: 'post' })
/** Pips cleared by a win, kept while they leave with the rest of the test marks. */
const parting = shallowRef<typeof shownPips | null>(null)
const pipsOf = (cell: number) =>
  parting.value?.[cell] ?? (pips.value[cell].length > 0 ? pips.value[cell] : (heldPips.value.get(cell) ?? []))

const boardEl = ref<HTMLElement | null>(null)
const cellEl = (cell: number) => boardEl.value?.querySelector<HTMLElement>(`[data-cell="${cell}"]`)

/** Bumped when an ink switch swaps a cell's test mark, so it leaves and enters again. */
let epoch: number[] = []
const markKey = (cell: number, kind: string) => `${kind}-${epoch[cell] ?? 0}`

// ---- Effects: auto-cross wave, "+points", "Clear!" and a burst ----

interface Effect {
  id: number
  cell: number
  kind: 'points' | 'clear' | 'proof' | 'burst' | 'dust' | 'slash' | 'streak' | 'heart'
  text?: string
  delay: number
  /** A burst's particles, or the cell a streak pill sits on. */
  streak?: number
}

/*
 * Two kinds of delay drive the marks. Animations (an X drawing, a test cat
 * poofing) keep the delay they started with, so those values must never
 * change while they run: `delays` and `outDelays` hold them as set. A
 * transition only reads its delay when it starts, so `--wd` gives the time
 * left until the wave arrives, for whatever starts on a later render.
 */
/** X marks of the latest waves: how long (ms) after its placement each one draws. */
const delays = new Map<number, number>()
/** When (performance.now()) the wave reaches each of those cells. */
const waveAt = new Map<number, number>()
/** How long (ms) a cell's leaving mark waits before going: sweeps, un-draws, overruled test cats. */
const outDelays = new Map<number, number>()
/** Time left (ms) until `at`. */
const left = (at: number | undefined) => Math.max(0, Math.round((at ?? 0) - performance.now()))
/** Marks undo just put back: they're there at once, with a small pop instead of a stroke draw. */
const restoredCells = shallowRef(new Set<number>())
/** A tapped cell is the player's now: no wave is still on its way to it. */
const forget = (cell: number) => {
  delays.delete(cell)
  waveAt.delete(cell)
  outDelays.delete(cell)
  if (restoredCells.value.has(cell)) restoredCells.value = new Set([...restoredCells.value].filter((c) => c !== cell))
}
/** Region that just got its cat: its cells shimmer once. */
const shimmer = ref<{ region: number; id: number } | null>(null)
const effects = ref<Effect[]>([])
const timers: number[] = []
let nextId = 0
const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms))

watch(
  () => props.placement,
  (p) => {
    if (!p) return
    const now = performance.now()
    for (const [cell, delay] of p.delays) {
      delays.set(cell, delay)
      waveAt.set(cell, now + delay)
    }
    if (p.kind === 'cat') {
      const held = new Map(heldPips.value)
      for (const [cell, delay] of p.delays) {
        const before = shownPips[cell]
        if (!before?.length) continue
        held.set(cell, before)
        later(() => {
          if (heldPips.value.get(cell) !== before) return
          const next = new Map(heldPips.value)
          next.delete(cell)
          heldPips.value = next
        }, delay)
      }
      heldPips.value = held
      const id = p.id
      shimmer.value = { region: props.puzzle.regions[p.cell], id }
      later(() => shimmer.value?.id === id && (shimmer.value = null), 900)
      if (!props.calm) impact(p.cell)
    }
    // Test cats are only a "what if": just the wave, no celebration (and calm mode keeps it to the words).
    const add: Effect[] =
      p.kind === 'ghost'
        ? []
        : [
            ...(props.calm
              ? []
              : [
                  { id: nextId++, cell: p.cell, kind: 'burst' as const, delay: 0, streak: p.streak },
                  { id: nextId++, cell: p.cell, kind: 'dust' as const, delay: 0 },
                ]),
            { id: nextId++, cell: p.cell, kind: 'clear', delay: 60 },
            ...p.clears.map((c) => ({ id: nextId++, cell: c.cell, kind: 'clear' as const, delay: c.delay })),
          ]
    if (p.points > 0) add.push({ id: nextId++, cell: p.cell, kind: 'points', text: `+${p.points}`, delay: 0 })
    // Three or more in a row: a "×N" pill pops on the next cell over as the cat lands (the last column's goes left).
    if (p.kind === 'cat' && p.streak >= 3) {
      const side = colOf(p.cell) === props.puzzle.size - 1 ? -1 : 1
      add.push({ id: nextId++, cell: p.cell + side, kind: 'streak', text: `×${p.streak}`, delay: LAND_IMPACT_MS })
    }
    const longest = Math.max(0, ...add.map((e) => e.delay), ...p.delays.values()) + 1200
    addEffects(add, longest)
    later(() => {
      for (const [cell, delay] of p.delays) {
        if (delays.get(cell) !== delay) continue
        delays.delete(cell)
        waveAt.delete(cell)
      }
    }, longest)
  },
)

// Bulb: its X's draw in a wave out from the reason, through the same delays as a cat's wave.
watch(
  () => props.hinted,
  (h) => {
    if (!h || h.delays.size === 0) return
    const now = performance.now()
    for (const [cell, delay] of h.delays) {
      delays.set(cell, delay)
      waveAt.set(cell, now + delay)
    }
    later(() => {
      for (const [cell, delay] of h.delays) {
        if (delays.get(cell) !== delay) continue
        delays.delete(cell)
        waveAt.delete(cell)
      }
    }, Math.max(...h.delays.values()) + 1200)
  },
)

/** The bulb's reason, outlined: traced in, then marching ants until the hint goes. */
const hintOutline = computed(() => {
  const h = props.hinted
  if (!h) return null
  const { size } = props.puzzle
  return { id: h.id, d: groupOutline(size, h.reason), length: outlineLength(size, h.reason) }
})

const mountedAt = performance.now()
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)'
const GRAVITY = 'cubic-bezier(0.55, 0, 1, 0.45)'

/**
 * A landing cat: its cell gives under the impact, and the cells around it
 * are pushed away and settle back, the farther ring a beat later. These run
 * on the individual `scale` and `translate` properties, so they add to a
 * press or the intro instead of replacing them.
 */
const impact = (cat: number) => {
  cellEl(cat)?.animate(
    // Pressed down as the cat falls (gravity), so the shrink peaks right as it
    // hits (110 + 40% of 260 ≈ LAND_IMPACT_MS); then it springs back past rest.
    [{ scale: '1', easing: GRAVITY }, { scale: '0.9', offset: 0.4, easing: SPRING }, { scale: '1' }],
    { duration: 260, delay: 110 },
  )
  // While the board is still building itself, a ripple would fight its intro.
  if (performance.now() - mountedAt < 1200) return
  for (let cell = 0; cell < cellCount.value; cell++) {
    const dx = colOf(cell) - colOf(cat)
    const dy = rowOf(cell) - rowOf(cat)
    const d = Math.max(Math.abs(dx), Math.abs(dy))
    if (d < 1 || d > 2) continue
    const push = 0.7 / d / Math.hypot(dx, dy)
    cellEl(cell)?.animate(
      [
        { translate: '0 0', easing: 'ease-out' },
        { translate: `${(dx * push).toFixed(3)}cqw ${(dy * push).toFixed(3)}cqw`, offset: 0.35, easing: 'ease-out' },
        { translate: '0 0' },
      ],
      { duration: 280, delay: LAND_IMPACT_MS + (d - 1) * 40 },
    )
  }
}

const addEffects = (add: Effect[], lifetime: number) => {
  effects.value.push(...add)
  later(() => {
    const done = new Set(add.map((e) => e.id))
    effects.value = effects.value.filter((e) => !done.has(e.id))
  }, lifetime)
}

/** Holds a cell's leaving mark back for `ms`. */
const holdOut = (cell: number, ms: number) => {
  outDelays.set(cell, ms)
  // Kept until the leave is surely over (the longest one runs 220ms).
  later(() => outDelays.get(cell) === ms && outDelays.delete(cell), ms + 400)
}

// Erase / Cross out: the layer's marks spin away in a diagonal sweep.
const sweeping = ref<number | null>(null)
watch(
  () => props.sweep,
  (s) => {
    if (!s) return
    const from = s.from ?? 0
    for (let cell = 0; cell < cellCount.value; cell++) {
      const steps = Math.abs(rowOf(cell) - rowOf(from)) + Math.abs(colOf(cell) - colOf(from))
      holdOut(cell, steps * 14)
    }
    sweeping.value = s.id
    later(() => sweeping.value === s.id && (sweeping.value = null), 800)
  },
)

// A test cat taken back: its X's retract, the farthest first.
const undrawing = shallowRef(new Set<number>())
watch(
  () => props.erased,
  (e) => {
    if (!e) return
    e.cells.forEach((cell, i) => holdOut(cell, e.delay + i * 25))
    undrawing.value = new Set([...undrawing.value, ...e.cells])
    later(() => (undrawing.value = new Set([...undrawing.value].filter((c) => !e.cells.includes(c)))), e.delay + e.cells.length * 25 + 600)
  },
)

// Overruled test cat: it poofs as the pen mark reaches it, under a red slash.
watch(
  () => props.refuted,
  (r) => {
    if (!r) return
    holdOut(r.cell, r.delay)
    later(() => {
      if (props.refuted === r) addEffects([{ id: nextId++, cell: r.cell, kind: 'slash', delay: 0 }], 900)
    }, r.delay)
  },
)

// Cross out: the proven X stamps down with a "Proof!".
const stamped = ref<number | null>(null)
watch(
  () => props.proof,
  (p) => {
    if (!p) return
    stamped.value = p.cell
    later(() => stamped.value === p.cell && (stamped.value = null), 600)
    addEffects([{ id: nextId++, cell: p.cell, kind: 'proof', delay: 60 }], 1200)
  },
)

watch(
  () => props.restored,
  (r) => {
    if (!r) return
    r.cells.forEach(forget)
    const back = new Set(r.cells)
    restoredCells.value = back
    later(() => restoredCells.value === back && (restoredCells.value = new Set()), 400)
  },
)

// Ink switch: the old focus layer shrinks into its corner, the new one grows out of its own.
const CORNERS = [
  [0, 0],
  [-1, -1],
  [1, -1],
  [-1, 1],
]
const switching = shallowRef<{ id: number; from: number; to: number; out: Set<number>; in: Map<number, number> } | null>(null)
watch(
  () => props.focusInk,
  (to, from) => {
    // A win puts the pen back while the test marks clear out on their own.
    if (props.celebrate != null) return
    const out = new Set<number>()
    const grow = new Map<number, number>()
    props.marks.forEach((pen, cell) => {
      const was = from > 0 && pen === 'empty' ? props.layers[from].mark[cell] : 'empty'
      const now = to > 0 && pen === 'empty' ? props.layers[to].mark[cell] : 'empty'
      if (was === 'empty' && now === 'empty') return
      epoch[cell] = (epoch[cell] ?? 0) + 1
      if (was !== 'empty') out.add(cell)
      if (now !== 'empty') grow.set(cell, grow.size * 4)
    })
    const id = nextId++
    switching.value = { id, from, to, out, in: grow }
    later(() => switching.value?.id === id && (switching.value = null), 420 + grow.size * 4)
  },
)

/**
 * What the finger just did to each cell, so a mark it takes away leaves the
 * right way (`data-leave`). Kept only while that leave runs: marks going for
 * other reasons later (undo, a sweep) leave their own way.
 */
const leaveAs = ref<Partial<Record<number, { id: number; outcome: PressOutcome }>>>({})
watch(
  () => props.pressed,
  (p) => {
    if (!p) return
    leaveAs.value[p.cell] = p
    later(() => leaveAs.value[p.cell]?.id === p.id && delete leaveAs.value[p.cell], 300)
    // A test ink tapped on a pen mark: the cell shakes its head.
    if (p.outcome !== 'blocked' || props.calm) return
    cellEl(p.cell)?.animate([0, -6, 6, 0].map((deg) => ({ rotate: `${deg}deg` })), { duration: 200, easing: 'ease-in-out' })
  },
)

// A wrong cat: its cell flinches, a few quick swings that die down.
watch(
  () => props.mistakeCell,
  (cell) => {
    if (cell === null || props.calm) return
    cellEl(cell)?.animate(
      [0, -1.2, 0.9, -0.6, 0.3, 0].map((x) => ({ translate: `${x}cqw 0` })),
      { duration: 300, easing: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)' },
    )
  },
)

/**
 * A slip: the cat that already rules the cell out squashes twice ("no, no")
 * and a dashed line runs from it to the cell, which shakes its head as the
 * line gets there.
 */
const slipLine = shallowRef<{ id: number; x1: number; y1: number; x2: number; y2: number } | null>(null)

/** The cat squashes "no, no" and the cell shakes its head as the line gets there. */
const shakeNo = (s: Slip) => {
  cellEl(s.by)
    ?.querySelector('.cat')
    ?.animate(
      [
        { scale: '1', easing: 'cubic-bezier(0.3, 0, 0.6, 1)' },
        { scale: '1.12 0.9', offset: 0.4, easing: SPRING },
        { scale: '1' },
      ],
      { duration: 160, iterations: 2 },
    )
  cellEl(s.cell)?.animate([0, -6, 6, 0].map((deg) => ({ rotate: `${deg}deg` })), {
    duration: 200,
    delay: 150,
    easing: 'ease-in-out',
  })
}
watch(
  () => props.slip,
  (s) => {
    if (!s) return
    if (!props.calm) shakeNo(s)
    // From the edge of the cat to the edge of the X, so neither face is crossed out.
    const [r1, c1, r2, c2] = [rowOf(s.by), colOf(s.by), rowOf(s.cell), colOf(s.cell)]
    const len = Math.hypot(r2 - r1, c2 - c1)
    const trim = Math.min(0.32, len / 4) / len
    slipLine.value = {
      id: s.id,
      x1: c1 + 0.5 + (c2 - c1) * trim,
      y1: r1 + 0.5 + (r2 - r1) * trim,
      x2: c2 + 0.5 - (c2 - c1) * trim,
      y2: r2 + 0.5 - (r2 - r1) * trim,
    }
    later(() => slipLine.value?.id === s.id && (slipLine.value = null), 650)
  },
)

// Out of fish: once the heart has broken, the colour drains and the cats get sad.
const sad = ref(false)
watch(
  () => props.dying,
  (now) => {
    if (!now) return (sad.value = false)
    later(() => (sad.value = !!props.dying), HEART_BREAK_MS)
  },
)

/** Win: cats light up as they start to hop, once the X's have cleared out of the way. */
const joy = ref(false)
watch(
  () => props.celebrate,
  (last) => {
    joy.value = false
    if (last == null) return
    // The test marks leave in a quick ring spreading out from the last cat.
    for (let cell = 0; cell < cellCount.value; cell++) holdOut(cell, chebyshev(cell, last) * WIN_RING_MS)
    parting.value = shownPips
    later(() => (parting.value = null), X_EXIT_MS)
    // Then every X spins out, ring by ring, leaving the solved picture. Each
    // ring starts on its own (rather than all at once with CSS delays), so
    // the work of starting them is spread over frames.
    const rings = Math.max(...Array.from({ length: cellCount.value }, (_, c) => chebyshev(c, last)))
    for (let d = 0; d <= rings; d++) {
      later(() => {
        if (props.celebrate !== last) return
        for (let cell = 0; cell < cellCount.value; cell++) {
          if (chebyshev(cell, last) === d) cellEl(cell)?.querySelector('.x')?.animate(props.calm ? X_FADE : X_EXIT, { duration: 200, fill: 'forwards' })
        }
      }, X_EXIT_MS + d * 35)
    }
    later(() => (joy.value = props.celebrate === last), HOP_MS)
  },
)

/** Win: delay (ms) per ring of distance from the last cat before a test mark leaves (also in `pip-out`). */
const WIN_RING_MS = 6

/** Win: X's start leaving once the test marks are gone; a small wind-up the other way, then they spin off and shrink away. */
const X_EXIT_MS = 450
const X_EXIT: Keyframe[] = [
  { transform: 'none', easing: 'ease-out' },
  { transform: 'scale(1.08) rotate(6deg)', opacity: 1, offset: 0.3, easing: GRAVITY },
  { transform: 'scale(0) rotate(-45deg)', opacity: 0 },
]
/** Calm mode: they just fade. */
const X_FADE: Keyframe[] = [{ opacity: 1 }, { opacity: 0 }]

/** Cells between `a` and `b`, counting diagonal steps as one. */
const chebyshev = (a: number, b: number) => Math.max(Math.abs(rowOf(a) - rowOf(b)), Math.abs(colOf(a) - colOf(b)))

const catMood = computed(() =>
  sad.value ? 'sad' : joy.value ? 'joy' : props.mistakeCell !== null ? 'worried' : 'happy',
)

// Next level: once the last cell is gone, the game loads the next board.
const OUTRO_CELL_MS = 200
/** Time between two diagonals leaving: 16ms, or less on big boards so it all takes ≤350ms. */
const outroStep = computed(() => Math.min(16, 150 / (2 * (props.puzzle.size - 1))))
watch(
  () => props.outro,
  (now) => now && later(() => emit('left'), 2 * (props.puzzle.size - 1) * outroStep.value + OUTRO_CELL_MS),
)

watch(
  () => props.puzzle,
  () => {
    delays.clear()
    waveAt.clear()
    outDelays.clear()
    effects.value = []
    epoch = []
    reveals.clear()
    heldPips.value = new Map()
    parting.value = null
  },
)

/**
 * Size of one cell step on screen (px). Outlines keep a constant stroke
 * (non-scaling), which also puts their dashes in screen px, so the trace-in
 * needs each outline's length in px.
 */
const svgEl = ref<SVGSVGElement | null>(null)
const svgWidth = ref(0)
const pitch = computed(() => svgWidth.value / props.puzzle.size)
const resize = new ResizeObserver(([entry]) => (svgWidth.value = entry.contentRect.width))
onMounted(() => svgEl.value && resize.observe(svgEl.value))

onBeforeUnmount(() => {
  timers.forEach(clearTimeout)
  clearTimeout(lookTimer)
  resize.disconnect()
})

// ---- Contradictions: red outlines around dead groups, dashed lines between clashing cats ----

/** When each contradiction first showed (ms after it appeared), so a re-render never restarts it. */
const reveals = new Map<string, number>()
const revealOf = (key: string, cells: number[]) => {
  if (!reveals.has(key)) reveals.set(key, revealAt(cells, new Map(cells.map((c) => [c, left(waveAt.get(c))]))))
  return reveals.get(key)!
}

const proofs = computed(() => {
  const { size } = props.puzzle
  const focus = props.focusInk > 0 ? props.contradictions.inks[props.focusInk - 1] : null
  const groups = [
    ...props.contradictions.pen.dead.map((cells) => ({ key: `p:${cells.join()}`, cells })),
    ...(focus?.dead ?? []).map((cells) => ({ key: `${props.focusInk}:${cells.join()}`, cells })),
  ]
  const clash = new Set(focus?.clash ?? [])
  const pairs = [...clash].flatMap((a) =>
    blockedBy(props.puzzle, a)
      .filter((b) => b > a && clash.has(b))
      .map((b) => ({ key: `${props.focusInk}:${a}-${b}`, cells: [a, b] })),
  )
  const outlines = groups.map((g) => ({
    ...g,
    d: groupOutline(size, g.cells),
    length: outlineLength(size, g.cells),
    reveal: revealOf(g.key, g.cells),
  }))
  const lines = pairs.map((p) => ({
    ...p,
    reveal: revealOf(p.key, p.cells),
    x1: colOf(p.cells[0]) + 0.5,
    y1: rowOf(p.cells[0]) + 0.5,
    x2: colOf(p.cells[1]) + 0.5,
    y2: rowOf(p.cells[1]) + 0.5,
  }))
  const live = new Set([...outlines, ...lines].map((i) => i.key))
  for (const key of reveals.keys()) if (!live.has(key)) reveals.delete(key)
  /** Cells in trouble, with when their trouble shows. */
  const cells = new Map<number, number>()
  for (const item of [...outlines, ...lines]) {
    for (const c of item.cells) cells.set(c, Math.min(cells.get(c) ?? Infinity, item.reveal))
  }
  return { outlines, lines, cells }
})

/** The focus layer ran into a wall: once its red shows, its test cats look worried... */
const broken = computed(() => props.focusInk > 0 && props.contradictions.broken.has(props.focusInk as 1 | 2 | 3))
const worried = ref(false)
watch(
  broken,
  (now) => {
    if (!now) return (worried.value = false)
    const at = Math.max(0, ...[...proofs.value.cells.values()])
    later(() => (worried.value = broken.value), at)
  },
  // After the render, so the new wave is already in `proofs`.
  { flush: 'post', immediate: true },
)

/** ...and if the pen can't cross its guess out yet, they pulse for attention. */
const stuck = computed(() => worried.value && props.contradictions.inks[props.focusInk - 1]?.refutable === null)

// Cells in a new contradiction shake once, as their outline appears (calm mode: they flash red instead).
let shaken = new Set<number>()
watch(
  () => proofs.value.cells,
  (cells) => {
    for (const [cell, reveal] of cells) {
      if (shaken.has(cell)) continue
      const color = REGION_COLORS[props.puzzle.regions[cell]]
      cellEl(cell)?.animate(
        props.calm
          ? [{ backgroundColor: color }, { backgroundColor: '#f0645f', offset: 0.3 }, { backgroundColor: color }]
          : [0, -0.9, 0.8, -0.5, 0.3, 0].map((x) => ({ translate: `${x}cqw 0` })),
        { duration: props.calm ? 600 : 360, delay: reveal, easing: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)' },
      )
    }
    shaken = new Set(cells.keys())
  },
  { flush: 'post' },
)

const at = (cell: number) => {
  const { x, y } = cellCenter(props.puzzle.size, cell)
  return { left: `${x}%`, top: `${y}%` }
}

/** Intro: cells pop in along diagonals starting from the bottom-left corner. */
const introDelay = (cell: number) => `${(props.puzzle.size - 1 - rowOf(cell) + colOf(cell)) * INTRO_STEP_MS}ms`
/** Outro: the same diagonals in reverse, from the top-right corner. */
const outroDelay = (cell: number) => `${(rowOf(cell) + props.puzzle.size - 1 - colOf(cell)) * outroStep.value}ms`

const cellStyle = (cell: number, region: number) => ({
  background: props.patterns ? `${REGION_PATTERNS[region]} 0 0 / 50% 50%, ${REGION_COLORS[region]}` : REGION_COLORS[region],
  animationDelay: props.outro ? outroDelay(cell) : introDelay(cell),
  '--wd': `${left(waveAt.get(cell))}ms`,
  '--out': `${outDelays.get(cell) ?? delays.get(cell) ?? 0}ms`,
  '--reveal': `${proofs.value.cells.get(cell) ?? 0}ms`,
  '--in-delay': `${switching.value?.in.get(cell) ?? 0}ms`,
  '--cheb': props.celebrate == null ? 0 : chebyshev(cell, props.celebrate),
})

/** What a screen reader hears for a cell: its row, column and mark. */
const cellLabel = (cell: number) => {
  const view = views.value[cell]
  const key = !view ? 'cellEmpty' : view.ink > 0 ? 'cellTest' : view.kind === 'cat' ? 'cellCat' : 'cellX'
  return tf(key, { r: rowOf(cell) + 1, c: colOf(cell) + 1 })
}

/** How long before an X starts drawing; marks that only move (ink switch, stamp) skip the draw. */
const drawDelay = (cell: number) =>
  switching.value?.in.has(cell) || stamped.value === cell ? -1000 : (delays.get(cell) ?? 0)

const boardStyle = computed(() => {
  const s = switching.value
  const [osx, osy] = CORNERS[s?.from ?? 0]
  const [isx, isy] = CORNERS[s?.to ?? 0]
  return {
    gridTemplateColumns: `repeat(${props.puzzle.size}, 1fr)`,
    '--ink': INKS[props.focusInk].color,
    '--osx': osx,
    '--osy': osy,
    '--isx': isx,
    '--isy': isy,
  }
})

const BURST_COLORS = ['#f7a8c4', '#9fd0f5', '#ffd25a', '#b6d899', '#c9b6ef', '#f1ac6f']
/**
 * Burst particles: thrown up and out, then pulled down by gravity. A purr
 * streak throws more of them, and farther: 10 for a first cat, 4 more per
 * cat in a row (up to 26), 15% farther per cat (up to 60%).
 */
const bursts = new Map<string, { vx: number; vy: number; color: string; size: number }[]>()
const burstOf = (streak = 0) => {
  const count = 10 + 4 * Math.min(Math.max(0, streak - 1), 4)
  const reach = 1 + 0.15 * Math.min(streak, 4)
  const key = `${count}:${reach}`
  if (!bursts.has(key)) {
    bursts.set(
      key,
      Array.from({ length: count }, (_, n) => {
        const angle = Math.PI * (0.08 + (0.84 * n) / (count - 1)) // fan across the upper half
        const speed = (6 + ((n * 7) % 5)) * reach
        return {
          vx: +(Math.cos(angle) * speed).toFixed(2),
          vy: +(-Math.sin(angle) * speed * 0.9 - 2).toFixed(2),
          color: BURST_COLORS[n % BURST_COLORS.length],
          size: 0.8 + ((n * 3) % 4) * 0.15,
        }
      }),
    )
  }
  return bursts.get(key)!
}


</script>

<template>
  <div class="board-box" :class="{ celebrate: celebrate != null, dying: sad, calm }">
    <div
      ref="boardEl"
      class="board"
      :class="{ spotlight: hinted, testing: !penActive, pen: penActive, sweeping: sweeping !== null, outro, spotting: spot != null }"
      dir="ltr"
      :style="boardStyle"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    >
      <div
        v-for="(region, cell) in puzzle.regions"
        :key="cell"
        :data-cell="cell"
        class="cell"
        :class="{
          dim: hinted && !hinted.target.includes(cell) && !hinted.reason.includes(cell),
          dead: proofs.outlines.some((o) => o.cells.includes(cell)),
          shimmer: shimmer?.region === region,
          undraw: undrawing.has(cell),
          stamp: stamped === cell,
          'sw-out': switching?.out.has(cell),
          'sw-in': switching?.in.has(cell),
          pressed: pressing === cell,
          lit: spot?.region === region,
        }"
        :data-leave="leaveAs[cell]?.outcome"
        :style="cellStyle(cell, region)"
        role="button"
        :aria-label="cellLabel(cell)"
      >
        <Transition name="mark">
          <div
            v-if="views[cell]"
            :key="markKey(cell, views[cell]!.kind)"
            class="mk"
            :class="[`is-${views[cell]!.kind}`, { test: views[cell]!.ink > 0, restored: restoredCells.has(cell) }]"
          >
            <CatFace
              v-if="views[cell]!.kind === 'cat'"
              class="cat"
              :mood="catMood"
              :look="lookAt(cell)"
              :pet="pets.get(cell) ?? 0"
              :still="calm"
              :style="{
                '--row': rowOf(cell),
                '--blink-delay': `${(cell * 1.37) % 5}s`,
                '--twitch-delay': `${(cell * 2.71) % 7}s`,
              }"
            />
            <XMark
              v-else-if="views[cell]!.kind === 'x'"
              class="x"
              :class="{ wrong: mistakes.has(cell), test: views[cell]!.ink > 0 }"
              :style="{ '--x-ink': INKS[views[cell]!.ink].color, '--x-halo': views[cell]!.ink > 0 ? INKS[views[cell]!.ink].halo : 'transparent' }"
              halo="var(--x-halo)"
              :delay="drawDelay(cell)"
              :animate="!restoredCells.has(cell) && !calm"
              :dur="dragged.has(cell) ? 80 : 130"
            />
            <div
              v-else
              class="ghost"
              :class="{ pulse: stuck }"
              :style="{ '--ink': INKS[views[cell]!.ink].color, '--halo': INKS[views[cell]!.ink].halo }"
            >
              <CatFace class="ghost-cat" still :mood="worried ? 'worried' : 'happy'" />
              <span class="ghost-q">?</span>
            </div>
          </div>
        </Transition>
        <i
          v-for="pip in pipsOf(cell)"
          :key="pip.ink"
          class="pip"
          :class="[`p${pip.ink}`, `is-${pip.kind}`, { parting }]"
          :style="{ '--ink': INKS[pip.ink].color, '--halo': INKS[pip.ink].halo }"
        />
        <Transition name="spot-ring">
          <i v-if="spot?.region === region" :key="spot.id" class="spot-ring" />
        </Transition>
        <Transition name="hint-cat">
          <CatSilhouette v-if="hinted?.place === cell" class="hint-cat" color="#fff" />
        </Transition>
        <div v-if="mistakeCell === cell" class="oops timed">
          <XMark class="oops-x" :animate="false" />
          <BrokenHeart class="oops-heart" />
        </div>
      </div>
    </div>

    <svg
      ref="svgEl"
      class="proofs"
      :viewBox="`0 0 ${puzzle.size} ${puzzle.size}`"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        v-for="o in proofs.outlines"
        :key="o.key"
        class="outline"
        :d="o.d"
        :style="{ '--reveal': `${o.reveal}ms`, '--len': `${o.length * pitch}px` }"
      />
      <line
        v-for="l in proofs.lines"
        :key="l.key"
        class="clash-line"
        :x1="l.x1"
        :y1="l.y1"
        :x2="l.x2"
        :y2="l.y2"
        :style="{ '--reveal': `${l.reveal}ms` }"
      />
      <line
        v-if="slipLine"
        :key="slipLine.id"
        class="because"
        :x1="slipLine.x1"
        :y1="slipLine.y1"
        :x2="slipLine.x2"
        :y2="slipLine.y2"
        :style="{ transformOrigin: `${slipLine.x1}px ${slipLine.y1}px` }"
      />
      <Transition name="hint-outline">
        <path
          v-if="hintOutline"
          :key="hintOutline.id"
          class="hint-outline"
          :d="hintOutline.d"
          :style="{ '--len': `${hintOutline.length * pitch}px` }"
        />
      </Transition>
    </svg>

    <div class="fx" dir="ltr" aria-hidden="true">
      <template v-for="e in effects" :key="e.id">
        <span v-if="e.kind === 'points'" class="points" :style="{ ...at(e.cell), animationDelay: `${e.delay}ms` }">
          {{ e.text }}
        </span>
        <span v-else-if="e.kind === 'clear'" class="clear" :style="{ ...at(e.cell), animationDelay: `${e.delay}ms` }">
          Clear!
        </span>
        <span v-else-if="e.kind === 'proof'" class="clear proof" :style="{ ...at(e.cell), animationDelay: `${e.delay}ms` }">
          Proof!
        </span>
        <span v-else-if="e.kind === 'slash'" class="slash" :style="{ ...at(e.cell), width: `${100 / puzzle.size}%` }">
          <svg viewBox="0 0 100 100">
            <path class="slash-halo" d="M16 16 L84 84" pathLength="1" />
            <path d="M16 16 L84 84" pathLength="1" />
          </svg>
        </span>
        <span v-else-if="e.kind === 'streak'" class="streak" :style="{ ...at(e.cell), animationDelay: `${e.delay}ms` }">
          <i class="shock" :style="{ animationDelay: `${e.delay}ms` }" />
          {{ e.text }}
        </span>
        <span
          v-else-if="e.kind === 'heart'"
          class="heart"
          :style="{ ...at(e.cell), animationDelay: `${e.delay}ms`, '--dx': `${[-4, 4.5, -1][e.streak ?? 0]}cqw` }"
        >
          <svg viewBox="0 0 24 22"><path d="M12 21 C4.5 15.4 1 11.6 1 7.2 C1 3.7 3.6 1 6.9 1 C9 1 10.9 2.2 12 4 C13.1 2.2 15 1 17.1 1 C20.4 1 23 3.7 23 7.2 C23 11.6 19.5 15.4 12 21 Z" /></svg>
        </span>
        <span v-else-if="e.kind === 'dust'" class="dust" :style="at(e.cell)">
          <i v-for="side in [-1, 1]" :key="side" :style="{ '--side': side }" />
        </span>
        <span v-else class="burst" :style="at(e.cell)">
          <i v-for="(p, n) in burstOf(e.streak)" :key="n" :style="{ '--vx': `${p.vx}cqw`, '--vy': `${p.vy}cqw`, '--c': p.color, '--s': p.size }">
            <b />
          </i>
        </span>
      </template>
    </div>
    <!-- Overlays placed over the cells, in the same gap-centred area as `cellCenter` (the coach's finger). -->
    <div class="over" dir="ltr">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.board-box {
  position: relative;
  /* Colour comes back quickly after "Get 3 fish". */
  transition: filter 300ms ease-out;
}

/* Out of fish: the colour drains from the board. */
.board-box.dying {
  filter: grayscale(0.7) brightness(0.95);
  transition: filter 450ms ease-in;
}

.board {
  position: relative;
  display: grid;
  gap: 0.8cqw;
  padding: 1.7cqw;
  background: var(--card);
  border-radius: 2.4cqw;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  transition:
    box-shadow 180ms,
    background-color 200ms ease-out;
}

/* Bulb hint: the tray dims with the cells, so the white outline on the gaps stands out. */
.board.spotlight {
  background-color: color-mix(in srgb, var(--card), rgb(40 28 28) 38%);
}

/* A test ink is active: the board wears its colour. */
.board.testing {
  box-shadow: 0 0 0 0.8cqw var(--ink);
}

.cell {
  position: relative;
  aspect-ratio: 1;
  border-radius: 1.15cqw;
  display: grid;
  place-items: center;
  cursor: pointer;
  /* Visible, so a cat can drop in from above its cell. */
  overflow: visible;
  animation: cell-in 0.35s cubic-bezier(0.34, 1.4, 0.64, 1) backwards;
  /* Springs back when the finger lifts. */
  transition:
    transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
    filter 0.2s;
}

/* Held under the finger: it sinks in at once and lights up a little. */
.cell.pressed {
  transform: scale(0.92);
  filter: brightness(1.12);
  transition-duration: 60ms;
  transition-timing-function: ease-out;
}

/* One mark per cell, filling it, so marks can move toward the cell's corners. */
.mk {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  transition: opacity 180ms var(--wd);
}

/* With the pen in hand, the focus test layer steps back. */
.board.pen .mk.test {
  opacity: 0.55;
}

/* ...but still fades all the way out when it leaves. */
.board.pen .mk.test.mark-leave-to {
  opacity: 0;
}

/*
 * Pen X's are white and fill the cell; test X's are smaller, in their ink,
 * with a halo. When a real cat's wave reaches a test X it turns into a pen X
 * on the spot (the proof moment), at the moment the wave gets there.
 */
.x {
  width: 100%;
  color: #fff;
  transition:
    color 260ms ease-out,
    width 200ms;
  transition-delay: var(--wd);
}

.x :deep(.halo) {
  transition: stroke 260ms ease-out var(--wd);
}

.x.test {
  width: 74%;
  color: var(--x-ink);
}

.x.wrong {
  color: #ec4b33;
}

/* Cats drop in and squash a little on landing (drawn above neighbours). */
.cat {
  position: relative;
  z-index: 3;
  width: 94%;
  margin-top: 4%;
  transform-origin: 50% 95%;
  animation: land 0.56s both;
}

/* Falls with gravity, squashes on impact, rebounds and settles. */
@keyframes land {
  0% {
    transform: translateY(-75%) scale(0.92, 1.1);
    opacity: 0;
    animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45);
  }
  12% {
    opacity: 1;
  }
  38% {
    transform: translateY(0) scale(1.2, 0.76);
    animation-timing-function: cubic-bezier(0.2, 0.8, 0.3, 1);
  }
  58% {
    transform: translateY(-10%) scale(0.94, 1.08);
    animation-timing-function: cubic-bezier(0.5, 0, 0.6, 1);
  }
  76% {
    transform: translateY(0) scale(1.06, 0.94);
  }
  90% {
    transform: scale(0.99, 1.01);
  }
  100% {
    transform: none;
  }
}

/* Marks leaving a cell shrink away instead of vanishing. */
.mark-leave-active {
  transition:
    transform 0.14s ease-in,
    opacity 0.14s ease-in;
  transition-delay: var(--out);
}

.mark-leave-to {
  transform: scale(0.4) rotate(20deg);
  opacity: 0;
}

/* Test cats poof: a little swell, then gone. */
.mk.is-ghost.mark-leave-active {
  transition: none;
  animation: poof 220ms var(--out) both;
}

/*
 * A test cat's auto X's, and an X tapped away, retract their strokes
 * (second stroke first, like the pen going back) instead.
 */
.undraw > .mk.mark-leave-active,
.cell[data-leave='erase'] > .mk.is-x.mark-leave-active {
  transition: none;
  animation: hold 120ms var(--out) both;
}

.undraw > .mk.mark-leave-to,
.cell[data-leave='erase'] > .mk.is-x.mark-leave-to {
  transform: none;
  opacity: 1;
}

.undraw > .mk.mark-leave-active :deep(path),
.cell[data-leave='erase'] > .mk.is-x.mark-leave-active :deep(path) {
  stroke-dasharray: 1;
  animation: undraw 60ms ease-in var(--out) both;
}

.undraw > .mk.mark-leave-active :deep(path:first-child),
.cell[data-leave='erase'] > .mk.is-x.mark-leave-active :deep(path:first-child) {
  animation-delay: calc(var(--out) + 60ms);
}

/* An X a cat lands on spins out of its way. */
.cell:is([data-leave='cat'], [data-leave='mistake']) > .mk.is-x.mark-leave-active {
  transition:
    transform 110ms ease-in,
    opacity 110ms ease-in;
}

.cell:is([data-leave='cat'], [data-leave='mistake']) > .mk.is-x.mark-leave-to {
  transform: scale(0.4) rotate(45deg);
  opacity: 0;
}

/* Erase / Cross out: everything spins away in a diagonal sweep. */
.board.sweeping .mk.mark-leave-active {
  animation: none;
  transition:
    transform 160ms cubic-bezier(0.55, 0, 1, 0.45),
    opacity 160ms cubic-bezier(0.55, 0, 1, 0.45);
  transition-delay: var(--out);
}

.board.sweeping .mk.mark-leave-to {
  transform: scale(0) rotate(-90deg);
  opacity: 0;
}

/* Ink switch: outgoing marks shrink into their ink's corner (where their pip appears)... */
.cell.sw-out > .mk.mark-leave-active {
  animation: none;
  transition:
    transform 160ms ease-in,
    opacity 160ms ease-in;
}

.cell.sw-out > .mk.mark-leave-to {
  transform: translate(calc(var(--osx) * (50% - 1.7cqw)), calc(var(--osy) * (50% - 1.7cqw))) scale(0.3);
  opacity: 0;
}

/* ...and incoming ones grow out of theirs, a cell at a time. */
.cell.sw-in > .mk.mark-enter-active {
  animation: none;
  transition: transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1) var(--in-delay);
}

.cell.sw-in > .mk.mark-enter-from {
  transform: translate(calc(var(--isx) * (50% - 1.7cqw)), calc(var(--isy) * (50% - 1.7cqw))) scale(0.3);
}

/* Cross out: the proven X comes down like a stamp. */
.cell.stamp > .mk {
  animation: stamp 180ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* Undo puts a mark straight back, whole, with a little pop. */
.mk.restored,
.mk.restored.mark-enter-active {
  animation: restore-pop 140ms ease-out;
}

@keyframes restore-pop {
  from {
    transform: scale(1.15);
  }
}

@keyframes poof {
  35% {
    transform: scale(1.2);
    opacity: 1;
    animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45);
  }
  100% {
    transform: scale(0);
    opacity: 0;
  }
}

@keyframes hold {
  to {
    opacity: 1;
  }
}

@keyframes undraw {
  from {
    stroke-dashoffset: 0;
  }
  to {
    stroke-dashoffset: 1;
  }
}

@keyframes stamp {
  from {
    transform: scale(1.6);
    opacity: 0;
  }
  30% {
    opacity: 1;
  }
}

/* A region that just got its cat: a light sweep across its cells. */
.shimmer::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(110deg, transparent 30%, rgb(255 255 255 / 0.55) 50%, transparent 70%);
  background-size: 250% 100%;
  animation: sweep 0.8s ease-out both;
}

@keyframes sweep {
  from {
    background-position: 130% 0;
  }
  to {
    background-position: -30% 0;
  }
}

/*
 * Win, from the last cat: the test marks have left (see `celebrate`), then
 * every X spins out in a ring from it, leaving the solved picture. The cats
 * hop for joy row by row, a shine sweeps across and the board glows.
 */

/* `land` stays first, so the last cat finishes its landing before it hops (HOP_MS, HOP_ROW_MS). */
.celebrate .cat {
  animation:
    land 0.56s both,
    hop 0.72s calc(600ms + var(--row) * 90ms) 2;
}

.celebrate .board {
  animation: win-glow 1.4s ease-out 1s;
}

.celebrate .board::after {
  content: '';
  position: absolute;
  z-index: 5;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(105deg, transparent 42%, rgb(255 255 255 / 0.55) 50%, transparent 58%);
  background-size: 250% 100%;
  animation: shine 650ms ease-in-out 1s both;
}

@keyframes shine {
  from {
    background-position: 150% 0;
  }
  to {
    background-position: -50% 0;
  }
}

/* Test marks in other inks' corners leave with the rest. */
.pip.parting {
  animation: pip-out 90ms ease-in calc(var(--cheb) * 6ms) forwards;
}

@keyframes pip-out {
  to {
    transform: scale(0);
    opacity: 0;
  }
}

/* The test marks clear out fast, so the win shows only the real picture. */
.celebrate .mk.test.mark-leave-active {
  transition-duration: 90ms;
}

.celebrate .mk.is-ghost.mark-leave-active,
.celebrate .undraw > .mk.mark-leave-active {
  animation-duration: 110ms;
}

.celebrate .pip-leave-to {
  transform: scale(0);
  opacity: 0;
}

/* Anticipation squash, stretched take-off, hang, squash on landing. */
@keyframes hop {
  0%,
  100% {
    transform: none;
  }
  18% {
    transform: translateY(4%) scale(1.14, 0.82);
    animation-timing-function: cubic-bezier(0.2, 0.7, 0.3, 1);
  }
  46% {
    transform: translateY(-34%) scale(0.9, 1.12) rotate(-4deg);
    animation-timing-function: cubic-bezier(0.3, 0, 0.6, 1);
  }
  60% {
    transform: translateY(-38%) scale(1) rotate(3deg);
    animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45);
  }
  80% {
    transform: translateY(0) scale(1.14, 0.84);
    animation-timing-function: ease-out;
  }
  91% {
    transform: scale(0.97, 1.04);
  }
}

@keyframes win-glow {
  30% {
    box-shadow: 0 0 0 1.2cqw #ffd23f, 0 0 6cqw rgb(255 210 63 / 0.7);
  }
}

/* Test cat: a see-through cat in a ring of its test ink. */
.ghost {
  position: relative;
  width: 88%;
  aspect-ratio: 1;
  border-radius: 50%;
  display: grid;
  place-items: center;
  box-shadow: inset 0 0 0 0.55cqw var(--ink), 0 0 0 0.35cqw var(--halo);
}

/* It never lands like a real cat: it fades into focus. */
.mk.is-ghost.mark-enter-active {
  animation: phase-in 220ms cubic-bezier(0.2, 0.8, 0.3, 1) backwards;
}

@keyframes phase-in {
  from {
    opacity: 0;
    transform: scale(0.6);
    filter: blur(0.6cqw);
  }
}

/* A broken guess the pen can't cross out yet: its test cats pulse for attention. */
.ghost.pulse {
  animation: ghost-pulse 0.9s ease-in-out infinite alternate;
}

@keyframes ghost-pulse {
  to {
    transform: scale(1.1);
    box-shadow: inset 0 0 0 0.55cqw #e8323a, 0 0 0 0.6cqw rgb(232 50 58 / 0.45);
  }
}

/* Test cats float and shimmer faintly, so they never read as real cats. */
.ghost-cat {
  width: 78%;
  margin-top: 8%;
  opacity: 0.55;
  animation: float 2.2s ease-in-out infinite alternate;
}

@keyframes float {
  from {
    transform: translateY(4%);
    opacity: 0.45;
  }
  to {
    transform: translateY(-6%);
    opacity: 0.65;
  }
}

.ghost-q {
  position: absolute;
  top: -6%;
  right: -8%;
  width: 38%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--ink);
  color: var(--halo);
  font-size: 2.6cqw;
  font-weight: 800;
  line-height: 1.5;
  text-align: center;
  box-shadow: 0 0 0 0.3cqw var(--halo);
}

/* Other test layers: a dot (X) or a ringed disc (test cat) in the ink's own corner. */
.pip {
  position: absolute;
  z-index: 2;
  border-radius: 50%;
  pointer-events: none;
  /* Appears as an outgoing mark arrives in its corner. */
  animation: pip-in 100ms ease-out 120ms backwards;
}

.pip.is-x {
  width: 2.2cqw;
  height: 2.2cqw;
  background: var(--ink);
  box-shadow: 0 0 0 0.35cqw var(--halo);
}

.pip.is-ghost {
  box-sizing: border-box;
  width: 3.2cqw;
  height: 3.2cqw;
  background: #fff;
  border: 0.5cqw solid var(--ink);
  box-shadow: 0 0 0 0.2cqw var(--halo);
}

.pip.p1 {
  top: 0.6cqw;
  left: 0.6cqw;
}

.pip.p2 {
  top: 0.6cqw;
  right: 0.6cqw;
}

.pip.p3 {
  bottom: 0.6cqw;
  left: 0.6cqw;
}

@keyframes pip-in {
  from {
    transform: scale(0.4);
    opacity: 0;
  }
}

/* A group with no room left: a red wash under its marks, as its outline draws (it wins over the hint's veil). */
.cell.dead::before {
  background: rgb(232 50 58 / 0.18);
  opacity: 1;
  transition: none;
  animation: wash 200ms ease-out var(--reveal) backwards;
}

@keyframes wash {
  from {
    opacity: 0;
  }
}

/* Outlines sit on the gap centres: whole cell units line up with the gaps. */
.proofs {
  position: absolute;
  z-index: 4;
  inset: 1.3cqw;
  width: calc(100% - 2.6cqw);
  height: calc(100% - 2.6cqw);
  overflow: visible;
  pointer-events: none;
}

.outline,
.clash-line {
  fill: none;
  stroke: #e8323a;
  stroke-width: 0.9cqw;
  vector-effect: non-scaling-stroke;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Traced in once, then it breathes. */
.outline {
  stroke-dasharray: var(--len);
  animation:
    trace 300ms ease-out var(--reveal) both,
    breathe 0.9s ease-in-out calc(var(--reveal) + 300ms) infinite alternate;
}

.clash-line {
  stroke-dasharray: 1.6cqw 1.4cqw;
  animation:
    wash 200ms ease-out var(--reveal) backwards,
    breathe 0.9s ease-in-out calc(var(--reveal) + 200ms) infinite alternate;
}

/* A slip's "because": a dashed line from the cat that rules the cell out, drawn out of the cat. */
.because {
  stroke: #fff;
  stroke-width: 0.6cqw;
  stroke-dasharray: 1.2cqw;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
  filter: drop-shadow(0 0 0.4cqw rgb(60 30 20 / 0.5));
  animation: because 600ms both;
}

@keyframes because {
  from {
    scale: 0;
    animation-timing-function: cubic-bezier(0.2, 0.8, 0.3, 1);
  }
  33% {
    scale: 1;
    opacity: 1;
  }
  67% {
    opacity: 1;
    animation-timing-function: ease-in;
  }
  to {
    scale: 1;
    opacity: 0;
  }
}

/* Hidden until it starts: a round cap would show the empty dash as a dot. */
@keyframes trace {
  from {
    stroke-dashoffset: var(--len);
    opacity: 0;
  }
  8% {
    opacity: 1;
  }
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes breathe {
  from {
    opacity: 1;
  }
  to {
    opacity: 0.7;
  }
}

/*
 * Bulb hint: a veil dims every other cell, under its marks, so the player's
 * own X's and cats keep their full strength. It is always there, see-through,
 * so it fades both in and out.
 */
.cell::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: rgb(40 28 28 / 0.38);
  opacity: 0;
  transition: opacity 200ms ease-out;
}

.spotlight .cell.dim::before {
  opacity: 1;
}

/* ...and the test inks fade right back, so only the pen's step shows. */
.spotlight .mk.test,
.spotlight .pip {
  opacity: 0.2;
}

/* The group that proves the step: a white outline traces in, opens into dashes, then marches. */
.hint-outline {
  fill: none;
  stroke: #fff;
  stroke-width: 0.9cqw;
  vector-effect: non-scaling-stroke;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(0 0 0.5cqw rgb(60 30 20 / 0.35));
  stroke-dasharray: var(--len);
  animation:
    trace 350ms ease-out both,
    ants-open 300ms ease-in-out 350ms forwards,
    ants 0.8s linear 650ms infinite;
}

/* The solid line splits into dashes (20 per loop) without changing their spacing. */
@keyframes ants-open {
  from {
    stroke-dasharray: calc(var(--len) * 0.05) 0;
  }
  to {
    stroke-dasharray: calc(var(--len) * 0.03) calc(var(--len) * 0.02);
  }
}

@keyframes ants {
  from {
    stroke-dashoffset: 0;
  }
  to {
    stroke-dashoffset: calc(var(--len) * -0.05);
  }
}

.hint-outline-leave-active {
  transition: opacity 200ms ease-in;
}

.hint-outline-leave-to {
  opacity: 0;
}

/* A forced cat: its see-through silhouette bobs in the cell, waiting for the double-tap. */
.hint-cat {
  position: absolute;
  width: 74%;
  opacity: 0.45;
  animation: hint-bob 700ms ease-in-out infinite alternate;
}

@keyframes hint-bob {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(-6%);
  }
}

.hint-cat-enter-active,
.hint-cat-leave-active {
  transition: opacity 200ms ease-out;
}

.hint-cat-enter-from,
.hint-cat-leave-to {
  opacity: 0;
}

/* Wrong cat: orange-red flash with an X, then a heart that breaks. */
.oops {
  position: absolute;
  inset: 0;
  z-index: 3;
  border-radius: inherit;
  display: grid;
  place-items: center;
  background: #f0613d;
  animation: oops-bg 1.1s ease-in forwards;
}

.oops > * {
  grid-area: 1 / 1;
  width: 72%;
}

.oops-x {
  width: 100%;
  color: #fff;
  animation: hide 0.01s 0.25s forwards;
}

@keyframes oops-bg {
  85% {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

@keyframes hide {
  to {
    visibility: hidden;
  }
}

@keyframes cell-in {
  from {
    transform: scale(0.3);
    opacity: 0;
  }
}

/* Next level: the cells shrink away, a diagonal at a time. */
.board.outro .cell {
  animation: cell-out 200ms cubic-bezier(0.55, 0, 1, 0.45) forwards;
}

@keyframes cell-out {
  to {
    transform: scale(0.3);
    opacity: 0;
  }
}

/*
 * Region spotlight (a strip head was tapped): the region's cells get a
 * white inner outline that pulses twice; the other cells dim a little.
 */
.board.spotting .cell:not(.lit) {
  filter: brightness(0.85);
}

.spot-ring {
  position: absolute;
  inset: 0;
  z-index: 2;
  border-radius: inherit;
  pointer-events: none;
  box-shadow:
    inset 0 0 0 0.5cqw #fff,
    inset 0 0 1.6cqw rgb(255 255 255 / 0.55);
  animation: spot-pulse 350ms ease-in-out 2;
}

.spot-ring-enter-active {
  transition: opacity 120ms ease-out;
}

.spot-ring-leave-active {
  transition: opacity 200ms ease-in;
}

.spot-ring-enter-from,
.spot-ring-leave-to {
  opacity: 0;
}

@keyframes spot-pulse {
  0%,
  100% {
    box-shadow:
      inset 0 0 0 0.5cqw #fff,
      inset 0 0 1.6cqw rgb(255 255 255 / 0.55);
  }
  45% {
    box-shadow:
      inset 0 0 0 0.9cqw #fff,
      inset 0 0 2.6cqw rgb(255 255 255 / 0.8);
  }
}

/* A purr streak: a "×N" pill pops on the next cell as the cat lands, with a shockwave. */
.streak {
  z-index: 1;
  padding: 0 1.3cqw;
  border-radius: 999px;
  background: #f7841e;
  box-shadow: 0 0 0 0.5cqw #fff, 0 0.8cqw 1.6cqw rgb(150 70 20 / 0.3);
  color: #fff;
  font-size: 4.4cqw;
  font-weight: 800;
  line-height: 1.35;
  white-space: nowrap;
  paint-order: stroke fill;
  -webkit-text-stroke: 0.25cqw #fff;
  animation: streak-pop 1.15s both;
}

.shock {
  position: absolute;
  z-index: -1;
  left: 50%;
  top: 50%;
  box-sizing: border-box;
  border-radius: 50%;
  border: 0.8cqw solid #f7a43e;
  translate: -50% -50%;
  animation: shock 420ms ease-out both;
}

/* In: 0 → 1.25 → 1 in 260ms (a spring), holds, then floats off and fades. */
@keyframes streak-pop {
  0% {
    transform: scale(0);
    animation-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  13% {
    transform: scale(1.25);
    animation-timing-function: cubic-bezier(0.45, 0, 0.55, 1);
  }
  23% {
    transform: scale(1);
  }
  80% {
    transform: none;
    opacity: 1;
    animation-timing-function: ease-in;
  }
  100% {
    transform: translateY(-2.5cqw) scale(0.9);
    opacity: 0;
  }
}

@keyframes shock {
  from {
    width: 0;
    height: 0;
    border-width: 0.8cqw;
    opacity: 1;
  }
  to {
    width: 16cqw;
    height: 16cqw;
    border-width: 0;
    opacity: 0.4;
  }
}

/*
 * Calm mode: the same information with much less movement. X's appear whole
 * (XMark's `animate` is off), cats fade in instead of dropping, and nothing loops.
 */
.calm .cat,
.celebrate.calm .cat {
  animation: calm-in 200ms ease-out both;
}

@keyframes calm-in {
  from {
    opacity: 0;
  }
}

.calm .ghost-cat,
.calm .ghost.pulse,
.calm .hint-cat,
.calm .outline,
.calm .clash-line,
.calm .board,
.calm .board::after,
.calm .shock {
  animation: none;
}

.calm .hint-outline {
  animation: none;
  stroke-dasharray: none;
}

.calm .points,
.calm .clear {
  animation-name: calm-float;
}

@keyframes calm-float {
  from,
  to {
    opacity: 0;
  }
  15%,
  80% {
    opacity: 1;
  }
}

/* Effects layer sits over the gap-centred grid area, where `cellCenter` is exact. */
.fx,
.over {
  position: absolute;
  z-index: 4;
  inset: 1.3cqw;
  pointer-events: none;
}

.fx > span {
  position: absolute;
  translate: -50% -50%;
}

/* Petting hearts: they rise and sway like bubbles, then fade. */
.heart {
  width: 4.2cqw;
  margin-top: -3cqw;
  animation: heart-rise 1.8s cubic-bezier(0.25, 0.55, 0.35, 1) both;
}

.heart svg {
  display: block;
  width: 100%;
  fill: #ff6f9c;
  stroke: #fff;
  stroke-width: 2;
  paint-order: stroke;
  filter: drop-shadow(0 0.3cqw 0.4cqw rgb(150 40 80 / 0.25));
  animation: heart-sway 0.65s ease-in-out infinite alternate;
}

@keyframes heart-rise {
  0% {
    transform: translate(0, 0) scale(0.2);
    opacity: 0;
  }
  18% {
    transform: translate(calc(var(--dx) * 0.3), -1.5cqw) scale(1.1);
    opacity: 1;
  }
  70% {
    opacity: 1;
  }
  100% {
    transform: translate(var(--dx), -19cqw) scale(0.75);
    opacity: 0;
  }
}

@keyframes heart-sway {
  from {
    rotate: -10deg;
  }
  to {
    rotate: 10deg;
  }
}

.points,
.clear {
  font-weight: 800;
  white-space: nowrap;
  paint-order: stroke fill;
  -webkit-text-stroke: 0.9cqw #fff;
}

.points {
  font-size: 5.6cqw;
  color: #f7841e;
  animation: float-up 1.1s ease-out both;
  margin-top: -5cqw;
}

.clear {
  font-size: 5cqw;
  font-style: italic;
  color: #ffd23f;
  -webkit-text-stroke: 0.9cqw #c8741c;
  margin-top: 4cqw;
  animation: clear-pop 1s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

/* Above its cell, so the stamped X stays in view. */
.clear.proof {
  margin-top: -5cqw;
  color: #3faba9;
  -webkit-text-stroke-color: #1d6e6c;
}

/* Overruled test cat: a red slash strikes through it, then fades. */
.slash svg {
  display: block;
  width: 100%;
}

.slash path {
  fill: none;
  stroke: #e8323a;
  stroke-width: 9;
  stroke-linecap: round;
  stroke-dasharray: 1;
  animation: slash 0.8s ease-out both;
}

.slash .slash-halo {
  stroke: #fff;
  stroke-width: 15;
}

@keyframes slash {
  from {
    stroke-dashoffset: 1;
  }
  18% {
    stroke-dashoffset: 0;
    opacity: 1;
  }
  70% {
    stroke-dashoffset: 0;
    opacity: 1;
  }
  to {
    stroke-dashoffset: 0;
    opacity: 0;
  }
}

/* Horizontal motion slows with air drag; vertical motion rises then falls. */
.burst i {
  position: absolute;
  animation: drift-x 0.9s cubic-bezier(0.15, 0.6, 0.35, 1) forwards;
}

.burst b {
  display: block;
  width: calc(1.5cqw * var(--s));
  height: calc(1.5cqw * var(--s));
  border-radius: 50%;
  background: var(--c);
  box-shadow: inset -0.2cqw -0.2cqw 0 rgb(0 0 0 / 0.12);
  animation: fall-y 0.9s forwards;
}

.dust i {
  position: absolute;
  top: 2.6cqw;
  width: 3cqw;
  height: 1.6cqw;
  margin-left: -1.5cqw;
  border-radius: 50%;
  background: rgb(255 255 255 / 0.85);
  opacity: 0;
  animation: dust 0.5s ease-out 0.2s forwards;
}

@keyframes float-up {
  from {
    transform: translateY(3cqw) scale(0.6);
    opacity: 0;
  }
  20% {
    transform: none;
    opacity: 1;
  }
  80% {
    opacity: 1;
  }
  to {
    transform: translateY(-4cqw);
    opacity: 0;
  }
}

@keyframes clear-pop {
  from {
    transform: scale(0);
    opacity: 0;
  }
  25% {
    transform: scale(1.1);
    opacity: 1;
  }
  75% {
    transform: scale(1);
    opacity: 1;
  }
  to {
    transform: scale(1) translateY(-2cqw);
    opacity: 0;
  }
}

@keyframes drift-x {
  to {
    transform: translateX(var(--vx));
  }
}

@keyframes fall-y {
  0% {
    transform: translateY(0);
    animation-timing-function: cubic-bezier(0.2, 0.6, 0.4, 1);
  }
  38% {
    transform: translateY(var(--vy));
    animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45);
  }
  80% {
    opacity: 1;
  }
  100% {
    transform: translateY(calc(var(--vy) * -0.9 + 4cqw)) scale(0.6);
    opacity: 0;
  }
}

@keyframes dust {
  0% {
    opacity: 0.9;
    transform: translateX(0) scale(0.6);
  }
  100% {
    opacity: 0;
    transform: translateX(calc(var(--side) * 4cqw)) translateY(-0.8cqw) scale(1.4);
  }
}
</style>
