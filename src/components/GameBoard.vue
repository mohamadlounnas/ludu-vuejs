<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { groupOutline, outlineLength } from '../game/outline'
import { INKS, REGION_COLORS } from '../game/palette'
import { blockedBy } from '../game/rules'
import { sfx } from '../game/sfx'
import type { InkLayer, PenMark, Puzzle } from '../game/types'
import {
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
  type Sweep,
} from '../game/useGame'
import BrokenHeart from './icons/BrokenHeart.vue'
import CatFace from './icons/CatFace.vue'
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
  /** What the last tap or drag did (a test ink on a pen mark wiggles the cell). */
  pressed: { id: number; cell: number; outcome: PressOutcome } | null
  /** Leaving for the next level: the cells go, the last to come in first. */
  outro?: boolean
}>()

const emit = defineEmits<{ press: [cell: number]; drag: [cell: number]; release: []; left: [] }>()

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
  emit('press', cell)
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
const pipsOf = (cell: number) => (pips.value[cell].length > 0 ? pips.value[cell] : (heldPips.value.get(cell) ?? []))

const boardEl = ref<HTMLElement | null>(null)
const cellEl = (cell: number) => boardEl.value?.querySelector<HTMLElement>(`[data-cell="${cell}"]`)

/** Bumped when an ink switch swaps a cell's test mark, so it leaves and enters again. */
let epoch: number[] = []
const markKey = (cell: number, kind: string) => `${kind}-${epoch[cell] ?? 0}`

// ---- Effects: auto-cross wave, "+points", "Clear!" and a burst ----

interface Effect {
  id: number
  cell: number
  kind: 'points' | 'clear' | 'proof' | 'burst' | 'dust' | 'slash'
  text?: string
  delay: number
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
      impact(p.cell)
    }
    // Test cats are only a "what if": just the wave, no celebration.
    const add: Effect[] =
      p.kind === 'ghost'
        ? []
        : [
            { id: nextId++, cell: p.cell, kind: 'burst', delay: 0 },
            { id: nextId++, cell: p.cell, kind: 'dust', delay: 0 },
            { id: nextId++, cell: p.cell, kind: 'clear', delay: 60 },
            ...p.clears.map((c) => ({ id: nextId++, cell: c.cell, kind: 'clear' as const, delay: c.delay })),
          ]
    if (p.points > 0) add.push({ id: nextId++, cell: p.cell, kind: 'points', text: `+${p.points}`, delay: 0 })
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
    if (p.outcome !== 'blocked') return
    cellEl(p.cell)?.animate([0, -6, 6, 0].map((deg) => ({ rotate: `${deg}deg` })), { duration: 200, easing: 'ease-in-out' })
  },
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

// Cells in a new contradiction shake once, as their outline appears.
let shaken = new Set<number>()
watch(
  () => proofs.value.cells,
  (cells) => {
    for (const [cell, reveal] of cells) {
      if (shaken.has(cell)) continue
      cellEl(cell)?.animate(
        [0, -0.9, 0.8, -0.5, 0.3, 0].map((x) => ({ translate: `${x}cqw 0` })),
        { duration: 360, delay: reveal, easing: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)' },
      )
    }
    shaken = new Set(cells.keys())
  },
  { flush: 'post' },
)

const at = (cell: number) => ({
  left: `${((colOf(cell) + 0.5) / props.puzzle.size) * 100}%`,
  top: `${((rowOf(cell) + 0.5) / props.puzzle.size) * 100}%`,
})

/** Intro: cells pop in along diagonals starting from the bottom-left corner. */
const introDelay = (cell: number) => `${(props.puzzle.size - 1 - rowOf(cell) + colOf(cell)) * INTRO_STEP_MS}ms`
/** Outro: the same diagonals in reverse, from the top-right corner. */
const outroDelay = (cell: number) => `${(rowOf(cell) + props.puzzle.size - 1 - colOf(cell)) * outroStep.value}ms`

const cellStyle = (cell: number, region: number) => ({
  background: REGION_COLORS[region],
  animationDelay: props.outro ? outroDelay(cell) : introDelay(cell),
  '--wd': `${left(waveAt.get(cell))}ms`,
  '--out': `${outDelays.get(cell) ?? delays.get(cell) ?? 0}ms`,
  '--reveal': `${proofs.value.cells.get(cell) ?? 0}ms`,
  '--in-delay': `${switching.value?.in.get(cell) ?? 0}ms`,
})

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
/** Burst particles: thrown up and out, then pulled down by gravity. */
const BURST = Array.from({ length: 14 }, (_, n) => {
  const angle = Math.PI * (0.08 + (0.84 * n) / 13) // fan across the upper half
  const speed = 6 + ((n * 7) % 5)
  return {
    vx: +(Math.cos(angle) * speed).toFixed(2),
    vy: +(-Math.sin(angle) * speed * 0.9 - 2).toFixed(2),
    color: BURST_COLORS[n % BURST_COLORS.length],
    size: 0.8 + ((n * 3) % 4) * 0.15,
  }
})

</script>

<template>
  <div class="board-box">
    <div
      ref="boardEl"
      class="board"
      :class="{ spotlight: hinted, testing: !penActive, pen: penActive, sweeping: sweeping !== null, outro }"
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
          'hint-target': hinted?.target.includes(cell),
          'hint-reason': hinted?.reason.includes(cell),
          dead: proofs.outlines.some((o) => o.cells.includes(cell)),
          shimmer: shimmer?.region === region,
          undraw: undrawing.has(cell),
          stamp: stamped === cell,
          'sw-out': switching?.out.has(cell),
          'sw-in': switching?.in.has(cell),
          pressed: pressing === cell,
        }"
        :data-leave="leaveAs[cell]?.outcome"
        :style="cellStyle(cell, region)"
        role="button"
        :aria-label="`${rowOf(cell) + 1}, ${colOf(cell) + 1}: ${views[cell]?.kind ?? 'empty'}`"
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
              :mood="mistakeCell !== null ? 'worried' : 'happy'"
              :look="lookAt(cell)"
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
              :animate="!restoredCells.has(cell)"
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
          :class="[`p${pip.ink}`, `is-${pip.kind}`]"
          :style="{ '--ink': INKS[pip.ink].color, '--halo': INKS[pip.ink].halo }"
        />
        <div v-if="mistakeCell === cell" class="oops">
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
        <span v-else-if="e.kind === 'dust'" class="dust" :style="at(e.cell)">
          <i v-for="side in [-1, 1]" :key="side" :style="{ '--side': side }" />
        </span>
        <span v-else class="burst" :style="at(e.cell)">
          <i v-for="(p, n) in BURST" :key="n" :style="{ '--vx': `${p.vx}cqw`, '--vy': `${p.vy}cqw`, '--c': p.color, '--s': p.size }">
            <b />
          </i>
        </span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.board-box {
  position: relative;
}

.board {
  display: grid;
  gap: 0.8cqw;
  padding: 1.7cqw;
  background: var(--card);
  border-radius: 2.4cqw;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  transition: box-shadow 180ms;
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

/* Win: every cat hops, row by row, then the board glows. */
.celebrate .cat {
  animation: hop 0.72s calc(var(--row) * 90ms) 2;
}

.celebrate .board {
  animation: win-glow 1.4s ease-out;
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

/* A group with no room left: a red wash under its marks, as its outline draws. */
.dead::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: rgb(232 50 58 / 0.18);
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

/* Bulb hint: everything else dims, so the step reads at a glance. */
.spotlight .cell:not(.hint-target, .hint-reason) {
  filter: brightness(0.6) saturate(0.6);
}

/* ...and the test inks fade right back, so only the pen's step shows. */
.spotlight .mk.test,
.spotlight .pip {
  opacity: 0.2;
}

/* Bulb hint: the proving group glows, the cells it decides pulse. */
.hint-reason::after,
.hint-target::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
}

.hint-reason::after {
  box-shadow: inset 0 0 0 0.6cqw rgb(255 255 255 / 0.9);
  animation: hint-glow 1.1s ease-in-out infinite alternate;
}

.hint-target::after {
  box-shadow: inset 0 0 0 0.7cqw #ffd23f, 0 0 2cqw #ffd23f;
  animation: hint-pulse 0.6s ease-in-out infinite alternate;
}

@keyframes hint-glow {
  from {
    opacity: 0.35;
  }
}

@keyframes hint-pulse {
  to {
    transform: scale(0.9);
  }
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

/* Effects layer sits over the grid area (inside the board padding). */
.fx {
  position: absolute;
  z-index: 4;
  inset: 1.7cqw;
  pointer-events: none;
}

.fx > span {
  position: absolute;
  translate: -50% -50%;
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
