<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { generatePuzzle } from '../game/generator'
import { bandForLevel, DAILY_BAND, DAILY_SIZE, seedForLevel, sizeForLevel } from '../game/levels'
import { packedLevel } from '../levels/pack'
import { clearBoard, loadBoard, saveBoard } from '../game/boardSave'
import { basicsTarget, ghostTarget, session } from '../game/coach'
import { cellCenter } from '../game/outline'
import { completeDaily, dailyDone, dayKey, progress, rewardLevel, type PowerUp } from '../game/progress'
import { dailySeed } from '../game/rng'
import { isSolutionCell } from '../game/rules'
import { haptic, sfx } from '../game/sfx'
import {
  DOUBLE_TAP_MS,
  HEART_BREAK_MS,
  HOP_MS,
  HOP_ROW_MS,
  INTRO_STEP_MS,
  LAND_IMPACT_MS,
  MAX_FISH,
  MISTAKE_MS,
  revealAt,
  useGame,
  type PressOutcome,
  type Slot,
} from '../game/useGame'
import { t, tf, type MessageKey } from '../i18n'
import CoachFinger from './CoachFinger.vue'
import AmbientBackground from './AmbientBackground.vue'
import GameBoard from './GameBoard.vue'
import InkBar from './InkBar.vue'
import AppIcons from './icons/AppIcons.vue'
import BulbIcon from './icons/BulbIcon.vue'
import CatFace from './icons/CatFace.vue'
import FishIcon from './icons/FishIcon.vue'
import MouseIcon from './icons/MouseIcon.vue'
import HugCat from './icons/HugCat.vue'
import Confetti from './Confetti.vue'
import FxLayer from './FxLayer.vue'
import PowerButton from './PowerButton.vue'
import RegionStrip from './RegionStrip.vue'
import ResultOverlay from './ResultOverlay.vue'
import RulesCard from './RulesCard.vue'
import SettingsSheet from './SettingsSheet.vue'

const props = defineProps<{ mode: 'level' | 'daily' }>()
const emit = defineEmits<{ back: [] }>()

const playedLevel = ref(progress.level)
// Levels come from the pre-built pack; past its end (and for the daily) they
// are generated on the spot with the same rules.
const nextPuzzle = () => {
  if (props.mode === 'daily') return generatePuzzle(DAILY_SIZE, dailySeed(new Date()), DAILY_BAND)
  const level = playedLevel.value
  return packedLevel(level) ?? generatePuzzle(sizeForLevel(level), seedForLevel(level), bandForLevel(level))
}

const calm = computed(() => progress.settings.calm)
const game = useGame(nextPuzzle(), { calm: () => calm.value })

// `?debug` exposes the game to automated review scripts (tools/review).
if (new URLSearchParams(location.search).has('debug')) {
  ;(window as unknown as { __catgrid: unknown }).__catgrid = game
}
const {
  puzzle,
  marks,
  layers,
  activeInk,
  focusInk,
  canUndo,
  inkUse,
  contradictions,
  ghostRegions,
  mistakes,
  fish,
  score,
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
  round,
  status,
  catRegions,
  catsLeft,
} = game

/** Changes whenever any test layer does (for the save and idle watchers). */
const layerPrint = computed(() => layers.value.map((layer) => layer.mark.join()).join('|'))
const hasTests = computed(() => inkUse.value.some((n) => n > 0))
const blank = computed(() => marks.value.every((m) => m === 'empty') && !hasTests.value)

/** The level banner shows until the first mark of the round, and not again when the board is wiped. */
const started = ref(false)
watch(blank, (isBlank) => !isBlank && (started.value = true))

const showSettings = ref(false)
/** The board is leaving for the next one (see `leave`). */
const leaving = ref(false)

// Idle nudge: after 25 s without any change, the bulb wiggles.
const idle = ref(false)
let idleTimer = 0
const resetIdle = () => {
  idle.value = false
  clearTimeout(idleTimer)
  idleTimer = window.setTimeout(() => (idle.value = status.value === 'playing'), 25_000)
}
watch([() => marks.value.join(), layerPrint, round], resetIdle, { immediate: true })
onBeforeUnmount(() => clearTimeout(idleTimer))

// Level-start banner (in place of the original's "x% of players" toast).
const difficultyDots = computed(() => {
  const d = puzzle.value.difficulty ?? 3
  return d <= 2 ? 1 : d === 3 ? 2 : d === 4 ? 3 : 4
})
const difficultyName = computed(() => t((['diffEasy', 'diffMedium', 'diffHard', 'diffExpert'] as const)[difficultyDots.value - 1]))
const levelLabel = computed(() => (props.mode === 'daily' ? t('dailyShort') : t('level')))
const levelValue = computed(() =>
  // The daily changes at UTC midnight: its date is the UTC one too.
  props.mode === 'daily' ? new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }) : playedLevel.value,
)

// Score counts up like the original's points counter, once the first sparkle reaches it (FxLayer).
const SPARKLE_LANDS_MS = 500
const shownScore = ref(0)
const bump = ref(0)
/** The Points value: the sparkles fly to it. */
const pointsEl = ref<HTMLElement | null>(null)
let countTimer = 0
onBeforeUnmount(() => clearTimeout(countTimer))
watch(score, (to, from) => {
  clearTimeout(countTimer)
  if (to < from) {
    shownScore.value = to
    return
  }
  const count = () => {
    bump.value++
    const start = performance.now()
    const base = shownScore.value
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / 700)
      shownScore.value = Math.round(base + (score.value - base) * (1 - (1 - k) ** 3))
      if (k < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
  const flying = placement.value?.kind === 'cat' && placement.value.points > 0 && !calm.value
  if (flying) countTimer = window.setTimeout(count, SPARKLE_LANDS_MS)
  else count()
})

// ---- Feedback: sounds and haptics for every action ----

/** The last tap and what it did (the board wiggles a blocked cell). */
const pressed = shallowRef<{ id: number; cell: number; outcome: PressOutcome } | null>(null)
let pressId = 0

/** Cells painted by the current drag: each scratch sounds a little higher. */
let dragSteps = 0

/** Petting a placed cat: a purr while it leans in, and now and then a happy chirp. */
let stopPurr: (() => void) | null = null
const onPet = () => {
  haptic(10)
  stopPurr?.()
  stopPurr = sfx.purr(1.5)
  if (Math.random() < 0.35) sfx.meow('chirp', 120)
}

const onPress = (cell: number, at?: number) => {
  const outcome = game.press(cell, at)
  // An X that stays an X (not the first tap of a cat).
  if (outcome === 'x' && activeInk.value === 0) {
    window.setTimeout(() => marks.value[cell] === 'x' && (handX.value = true), DOUBLE_TAP_MS)
  }
  pressed.value = { id: ++pressId, cell, outcome }
  dragSteps = 0
  if (outcome === 'x') {
    sfx.x()
    haptic(8)
  } else if (outcome === 'erase' || outcome === 'unghost') sfx.erase()
  else if (outcome === 'ghost') sfx.ghost()
  else if (outcome === 'blocked') {
    sfx.blocked()
    haptic(6)
  }
  // The second tap of a double-tap: the first tap's X never gets its second stroke.
  else if (outcome === 'cat' || outcome === 'mistake') sfx.lift()
  // Real cats sound from `placement` and mistakes from `mistakeCell`, wherever they come from.
}

/** A held second press turned into a drag: it paints on, no cat. */
const onStroke = (cell: number) => {
  game.stroke(cell)
  dragSteps = 0
}

const onDrag = (cell: number) => {
  const outcome = game.drag(cell)
  if (outcome === 'none') return
  pressed.value = { id: ++pressId, cell, outcome }
  if (outcome === 'x') sfx.drag(++dragSteps)
  else sfx.erase()
}

const onRelease = () => {
  dragSteps = 0
  game.release()
}

const onPick = (inkIndex: number) => {
  sfx.ui()
  game.setInk(inkIndex)
}

/** The placement this screen last saw, and when, to tell a wave that came with a contradiction. */
let seen = { placement: null as typeof placement.value, at: 0 }
const freshWave = () => {
  const p = placement.value
  const fresh = p && (p !== seen.placement || performance.now() - seen.at < 50)
  return fresh ? p.delays : new Map<number, number>()
}
watch(placement, (p) => {
  if (!p) return
  seen = { placement: p, at: performance.now() }
  // Each X of the wave plinks as it draws.
  sfx.wave(p.delays, p.kind === 'ghost' ? 'test' : 'cat')
  if (p.kind === 'ghost') return
  sfx.cat(LAND_IMPACT_MS, p.streak)
  if (p.points > 0 && !calm.value) sfx.ting(SPARKLE_LANDS_MS)
  haptic(25)
  for (const c of p.clears) sfx.clear(c.delay)
})

/**
 * Broken inks as the player sees them: a newly broken ink only counts once
 * its red shows on the board, right after the X that caused it, so the ink
 * bar never gives it away while the wave is still drawing.
 */
const shownBroken = ref(new Set<Slot>())
const revealing = ref(0)
/** Set while a saved board is put back: what it brings is not news. */
let resuming = false
watch(
  () => contradictions.value.broken,
  (now, before) => {
    shownBroken.value = new Set([...shownBroken.value].filter((k) => now.has(k)))
    for (const k of now) {
      if (before?.has(k)) continue
      if (!before || resuming) {
        // Nothing new to announce.
        shownBroken.value.add(k)
        continue
      }
      const c = contradictions.value
      const cells = k === 0 ? c.pen.dead.flat() : [...c.inks[k - 1]!.dead.flat(), ...c.inks[k - 1]!.clash]
      const at = revealAt(cells, freshWave())
      sfx.contradiction(at)
      revealing.value++
      window.setTimeout(() => {
        revealing.value--
        if (!contradictions.value.broken.has(k)) return
        shownBroken.value = new Set([...shownBroken.value, k])
        haptic([15, 40, 15])
      }, at)
    }
  },
  { immediate: true },
)

// The pen overruled a test cat: once a tap can't become a double-tap, or as the wave reaches it.
const nope = shallowRef<{ id: number; ink: number } | null>(null)
watch(refuted, (r) => {
  if (!r) return
  window.setTimeout(() => {
    if (refuted.value !== r) return
    sfx.refute()
    nope.value = { id: r.id, ink: r.ink }
  }, r.delay)
})

watch(proof, (p) => {
  if (!p) return
  sfx.proof()
  haptic(20)
})

// A slip on a cell a real cat already rules out: a soft "nope", never a fish.
watch(slip, (s) => {
  if (!s) return
  sfx.blocked()
  haptic(12)
})

// ---- Coach: a paw on real deductions for the first levels, then a 3-step ink coach ----

/** Where the paw points: a board cell, the first test ink chip, or the ink bar's action pill. */
type Finger = { on: 'cell'; cell: number; double: boolean } | { on: 'ink' } | { on: 'act' }
interface Coach {
  key: MessageKey
  finger: Finger | null
  dismiss: () => void
}

/**
 * The basics are learnt once the player has drawn an X by hand and found a
 * cat. The first levels open on a forced cat, so the paw then carries on to
 * the next proven step until both gestures are done.
 */
const handX = ref(false)
watch(
  () => handX.value && marks.value.includes('cat'),
  (learnt) => learnt && playedLevel.value <= 2 && basicsDone(),
)

const basicsDone = () => (progress.tips.basics = true)
const inksDone = () => (progress.tips.inks = true)

/** A test cat on the board: the focus layer's first, else any layer's. */
const testCat = computed(() => {
  for (const k of [focusInk.value, 1, 2, 3]) {
    if (k > 0 && layers.value[k].mark.includes('ghost')) return k
  }
  return 0
})

/** Every test cat of layer `k` sits on a real cat's cell. */
const keepSafe = (k: number) => layers.value[k].mark.every((m, i) => m !== 'ghost' || isSolutionCell(puzzle.value, i))

/** "Keep" is only suggested once a test cat has stood for a while without a clash. */
const keepReady = ref(false)
let keepTimer = 0
watch(testCat, (k) => {
  clearTimeout(keepTimer)
  keepReady.value = false
  if (k > 0) keepTimer = window.setTimeout(() => (keepReady.value = true), 4000)
})

const coach = computed<Coach | null>(() => {
  if (status.value !== 'playing' || leaving.value) return null
  if (props.mode === 'level' && !progress.tips.basics && playedLevel.value <= 2) {
    // Only ever a step the pen alone proves (logic.ts): the coach never guesses.
    const target = basicsTarget(game.provenStep(), !handX.value)
    if (!target) return null
    return { key: target.double ? 'tipCat' : 'tipTap', finger: { on: 'cell', ...target }, dismiss: basicsDone }
  }
  if (!progress.tips.inks && (props.mode === 'daily' || playedLevel.value >= 6)) {
    const k = testCat.value
    if (k > 0) {
      if (shownBroken.value.has(k as Slot)) return { key: 'coachCrossOut', finger: { on: 'act' }, dismiss: inksDone }
      if (!keepReady.value) return null
      // "Keep" commits the test cats for real: only urged when that is safe.
      return keepSafe(k) ? { key: 'coachKeep', finger: null, dismiss: inksDone } : { key: 'coachGoOn', finger: null, dismiss: inksDone }
    }
    if (activeInk.value > 0) {
      const cell = ghostTarget(puzzle.value, game.effective(activeInk.value), marks.value)
      return { key: 'coachGhost', finger: cell === null ? null : { on: 'cell', cell, double: true }, dismiss: inksDone }
    }
    return { key: 'coachPick', finger: { on: 'ink' }, dismiss: inksDone }
  }
  return null
})
// The level banner gives way to the coach's paw and to the bulb's spotlight.
watch(
  () => coach.value?.finger?.on === 'cell' || hinted.value !== null,
  (busy) => busy && (started.value = true),
  { immediate: true },
)

/** The paw on the board (hidden while the bulb has the stage). */
const boardFinger = computed(() => {
  const f = coach.value?.finger
  if (f?.on !== 'cell' || hinted.value) return null
  const { x, y } = cellCenter(puzzle.value.size, f.cell)
  return { x: `${x}%`, y: `${y}%`, double: f.double }
})

/** The paw on the ink bar: a point on its target, measured in `.tools` (layout only, so mid-animation transforms don't move it). */
const toolsEl = ref<HTMLElement | null>(null)
const toolFinger = ref<{ x: string; y: string } | null>(null)
const placeToolFinger = () => {
  const f = coach.value?.finger
  const root = toolsEl.value
  const el = root?.querySelector<HTMLElement>(f?.on === 'ink' ? '.ink-bar .ink:nth-child(2)' : '.ink-bar .slot')
  if (!root || !el || (f?.on !== 'ink' && f?.on !== 'act')) return (toolFinger.value = null)
  // The pill is tapped low on its middle, so the paw hangs below its label instead of over it.
  let x = el.offsetWidth / 2
  let y = el.offsetHeight * (f.on === 'act' ? 0.8 : 0.5)
  for (let n: HTMLElement | null = el; n && n !== root; n = n.offsetParent as HTMLElement | null) {
    x += n.offsetLeft
    y += n.offsetTop
  }
  toolFinger.value = { x: `${x}px`, y: `${y}px` }
}
watch(() => coach.value?.finger?.on, () => nextTick(placeToolFinger))
const onResize = () => placeToolFinger()
onMounted(() => {
  placeToolFinger()
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  clearTimeout(keepTimer)
})

// The first test cat of a session says it costs nothing.
const ghostFree = ref(false)
watch(placement, (p) => {
  if (p?.kind !== 'ghost' || session.ghostFreeShown) return
  session.ghostFreeShown = true
  ghostFree.value = true
  window.setTimeout(() => (ghostFree.value = false), 1600)
})

// Keep, Cross out and Erase are what the ink coach teaches: any of them ends it.
const onKeep = (ink: number) => game.keepInk(ink) && inksDone()
const onCrossOut = (ink: number) => game.crossOutGuess(ink) && inksDone()

// A bump on the wrong cat, then another as the heart cracks (650ms in).
watch(mistakeCell, (cell) => {
  if (cell === null) return
  sfx.wrong()
  haptic([35, 615, 60])
})

// ---- Win: the board clears, cats hop and confetti falls, then the result card ----

const celebrating = ref(false)
/** The last cat of a won board: the celebration spreads out from it. */
const lastCat = ref<number | null>(null)
const showWin = ref(false)
const showLost = ref(false)
/** Out of fish: the board greys out behind the card. */
const dying = ref(false)

// A fish breaks only when the heart does.
const shownFish = ref(fish.value)
/** "Get 3 fish": the fish pop back one at a time, so the pill fills itself. */
const refilling = ref(false)
watch(fish, (to, from) => {
  if (to < from) window.setTimeout(() => (shownFish.value = fish.value), HEART_BREAK_MS)
  else if (!refilling.value) shownFish.value = to
})

/** One fish left: it breathes and the pill rings red, until the heart takes it or a refill. */
const lastFish = computed(() => shownFish.value === 1 && fish.value <= 1 && status.value !== 'won')

/** The refill waits for the card to fade out, then pops a fish in every 90ms. */
const REFILL_MS = 200
const REFILL_STEP_MS = 90
const refill = () => {
  refilling.value = true
  const from = shownFish.value
  for (let i = from + 1; i <= MAX_FISH; i++) {
    const at = REFILL_MS + (i - from - 1) * REFILL_STEP_MS
    sfx.bloop(at)
    window.setTimeout(() => (shownFish.value = i), at)
  }
  // Once the last pop is over.
  window.setTimeout(() => (refilling.value = false), REFILL_MS + MAX_FISH * REFILL_STEP_MS + 300)
}

// ---- Resume: the board in progress is saved and restored per mode ----

const boardId = computed(() => (props.mode === 'daily' ? dayKey(new Date()) : String(playedLevel.value)))
const resumed = loadBoard(props.mode, boardId.value)
if (resumed) {
  resuming = true
  queueMicrotask(() => (resuming = false))
  game.restore(resumed)
  shownFish.value = fish.value
  started.value = !blank.value
}
let saveTimer = 0
watch(
  [() => marks.value.join(), layerPrint, fish, score],
  () => {
    clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      if (status.value === 'won') return
      if (blank.value && fish.value === MAX_FISH) clearBoard(props.mode)
      else saveBoard(props.mode, boardId.value, game.saveState())
    }, 250)
  },
)
const timeTaken = ref('')
const stars = ref(0)
// The board builds itself on every (re)start; its plinks climb with it.
const introSound = () => sfx.intro(2 * puzzle.value.size - 1, INTRO_STEP_MS)
onMounted(introSound)

watch(round, () => {
  introSound()
  started.value = false
  shownBroken.value = new Set()
  celebrating.value = false
  lastCat.value = null
  showWin.value = false
  showLost.value = false
  shownFish.value = fish.value
})

// The clock only runs while the game is in front of the player.
const onVisibility = () => (document.visibilityState === 'hidden' ? game.pause() : game.resume())
const onPageHide = () => game.pause()
const onPageShow = () => document.visibilityState === 'visible' && game.resume()
onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('pageshow', onPageShow)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('pagehide', onPageHide)
  window.removeEventListener('pageshow', onPageShow)
})

/** The result card comes once the cats have hopped and the confetti has started. */
const WIN_CARD_MS = 1700
const CONFETTI_MS = 1250
/** Reward chips pop in after the last star, this far apart. */
const CHIPS_MS = 1300
const CHIP_STEP_MS = 120
let winTimer = 0
onBeforeUnmount(() => clearTimeout(winTimer))

/** What clearing the level granted (none for the daily). */
const rewards = ref<PowerUp[]>([])
/** The card's points, counting up. */
const cardScore = ref(0)

const countUp = (to: number) => {
  const start = performance.now()
  let ticked = 0
  const tick = (now: number) => {
    const k = Math.min(1, (now - start) / 900)
    const value = Math.round(to * (1 - (1 - k) ** 3))
    if (value !== cardScore.value && now - ticked >= 45) {
      sfx.ui()
      ticked = now
    }
    cardScore.value = value
    if (k < 1 && showWin.value) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

const revealWin = () => {
  clearTimeout(winTimer)
  if (showWin.value || status.value !== 'won') return
  showWin.value = true
  cardScore.value = 0
  window.setTimeout(() => countUp(score.value), 300)
  for (let i = 0; i < stars.value; i++) window.setTimeout(() => sfx.star(i), 450 + i * 260)
  rewards.value.forEach((_, n) => sfx.pop(CHIPS_MS + n * CHIP_STEP_MS))
}

/** A tap that starts and ends during the celebration skips to the card (not the tap that won). */
let skipArmed = false
const onDownCapture = (e: PointerEvent) => {
  // A new press: whatever the last skip swallowed is over.
  swallowClick = false
  skipArmed = celebrating.value && !showWin.value
  skipOutro(e)
}

/**
 * The click that ends a skip tap would land on whatever the new board put
 * under the finger (a power-up, an ink chip, Back): it's eaten here.
 */
let swallowClick = false
let swallowTimer = 0
const onClickCapture = (e: MouseEvent) => {
  if (!swallowClick) return
  swallowClick = false
  e.stopPropagation()
  e.preventDefault()
}
const onUpCapture = () => {
  if (!skipArmed) return
  skipArmed = false
  revealWin()
}

// A board restored with no fish left is already lost: show its card right away.
if (status.value === 'lost') {
  dying.value = true
  showLost.value = true
}

watch(status, (s) => {
  dying.value = s === 'lost'
  if (s === 'lost') {
    // Let the broken heart and the crumbling fish play before the card.
    window.setTimeout(() => {
      if (status.value !== 'lost') return
      showLost.value = true
      sfx.lose()
      haptic([60, 80, 120])
    }, MISTAKE_MS)
    return
  }
  showLost.value = false
  if (s !== 'won') return
  game.clearTests()
  const secs = Math.round(game.elapsed() / 1000)
  timeTaken.value = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
  // A refilled ("Get 3 fish") win is worth one star.
  stars.value = continued.value ? 1 : fish.value
  lastCat.value = placement.value?.cell ?? 0
  celebrating.value = true
  haptic([30, 50, 30, 50, 60])
  winTimer = window.setTimeout(revealWin, WIN_CARD_MS)
  // The winning frame only starts the picture (test marks clearing, cats
  // about to hop); saving, rewards and building the win's sounds wait a
  // frame, so the board answers the tap at once.
  const wonAt = performance.now()
  let done = false
  const settle = () => {
    if (done) return
    done = true
    // One note per row of cats, as each row takes off (counted from the tap).
    const late = performance.now() - wonAt
    sfx.win(puzzle.value.size, Math.max(0, HOP_MS - late), HOP_ROW_MS)
    clearBoard(props.mode)
    if (props.mode === 'daily') {
      rewards.value = []
      // Replaying a finished daily is for fun: no extra points.
      if (!dailyDone()) progress.points += score.value
      completeDaily()
      return
    }
    progress.points += score.value
    rewards.value = rewardLevel(playedLevel.value)
    progress.level = playedLevel.value + 1
  }
  requestAnimationFrame(() => window.setTimeout(settle))
  // Frames stop in a background tab: the win is saved anyway.
  window.setTimeout(settle, 150)
})

// ---- Level to level: the board leaves (a tap skips it), then the next one builds itself ----

let afterOutro: (() => void) | null = null

const leave = (load: () => void) => {
  if (leaving.value) return
  leaving.value = true
  afterOutro = load
}

/** The board is gone (or a tap skipped the rest): load what comes next. */
const arrive = () => {
  const load = afterOutro
  if (!load) return
  afterOutro = null
  load()
  leaving.value = false
}

/** A tap while the board leaves skips the rest, without reaching the board or a button. */
const skipOutro = (e: PointerEvent) => {
  if (!afterOutro) return
  e.stopPropagation()
  swallowClick = true
  clearTimeout(swallowTimer)
  swallowTimer = window.setTimeout(() => (swallowClick = false), 700)
  arrive()
}
onBeforeUnmount(() => clearTimeout(swallowTimer))

const nextLevel = () => {
  if (props.mode === 'daily') {
    emit('back')
    return
  }
  leave(() => {
    playedLevel.value = progress.level
    game.load(nextPuzzle())
  })
}

const onNext = () => {
  sfx.ui()
  nextLevel()
}

const retry = () => {
  sfx.ui()
  leave(() => game.load(puzzle.value))
}

const getFish = () => {
  sfx.ui()
  if (game.continueWithFish()) refill()
}

/** Bumped when the bulb is used: it lights up. */
const bulbFlash = ref(0)

/** The bulb's caption: the technique, its name in bold. */
const TECHNIQUES = { single: 'techSingle', confine: 'techConfine', squeeze: 'techSqueeze' } as const
const caption = computed(() => {
  const h = hinted.value
  if (!h) return null
  const text = t(TECHNIQUES[h.technique])
  const colon = text.indexOf(':')
  return { id: h.id, name: text.slice(0, colon + 1), rest: text.slice(colon + 1) }
})

const usePower = (power: PowerUp) => {
  if (progress.powerUps[power] === 0) return
  sfx.ui()
  const used = { cat: game.revealCat, bulb: game.hint, mouse: game.clearMistakes }[power]()
  if (!used) return
  progress.powerUps[power]--
  if (power === 'bulb') {
    sfx.hint()
    // Its X's plink as they draw, like a cat's wave.
    if (hinted.value) sfx.wave(hinted.value.delays, 'cat')
    bulbFlash.value++
  }
  if (power === 'mouse') sfx.mouse()
}

const onUndo = () => game.undo() && sfx.undo()
const onErase = (inkIndex: number) => {
  if (!game.eraseInk(inkIndex)) return
  sfx.erase()
  inksDone()
}

// ---- Region spotlight: a strip head shows where its region is, and how much room it has ----

/** Open cells per region, as the board shows them: the pen plus the focus layer. */
const openCells = computed(() => {
  const counts = new Array<number>(puzzle.value.size).fill(0)
  const focus = focusInk.value > 0 ? layers.value[focusInk.value].mark : null
  marks.value.forEach((m, c) => m === 'empty' && (!focus || focus[c] === 'empty') && counts[puzzle.value.regions[c]]++)
  return counts
})

const SPOT_MS = 900
const spot = shallowRef<{ region: number; id: number } | null>(null)
let spotId = 0
const onSpot = (region: number) => {
  sfx.ui()
  const id = ++spotId
  spot.value = { region, id }
  window.setTimeout(() => spot.value?.id === id && (spot.value = null), SPOT_MS)
}
watch(round, () => (spot.value = null))

const onReset = () => {
  showSettings.value = false
  if (props.mode === 'level') nextLevel()
}
</script>

<template>
  <div
    class="game"
    :class="{ calm }"
    @pointerdown.capture="onDownCapture"
    @pointerup.capture="onUpCapture"
    @click.capture="onClickCapture"
  >
    <AmbientBackground variant="game" :calm="calm" />
    <header dir="ltr">
      <button class="round" :aria-label="t('back')" @click="emit('back')">
        <AppIcons name="back" />
      </button>
      <div class="stats">
        <div class="stat">
          <span class="label">{{ levelLabel }}</span>
          <span class="value">{{ levelValue }}</span>
        </div>
        <div class="stat">
          <span class="label">{{ t('points') }}</span>
          <span :key="bump" ref="pointsEl" class="value" :class="{ bump: bump > 0 }">{{ shownScore }}</span>
        </div>
      </div>
      <button class="round" :aria-label="t('settings')" @click="showSettings = true">
        <AppIcons name="gear" />
      </button>
    </header>

    <div class="fish" :class="{ last: lastFish }" dir="ltr" :aria-label="`${t('fishLeft')}: ${fish}`">
      <FishIcon
        v-for="i in MAX_FISH"
        :key="i"
        :lost="i > shownFish"
        :class="{ gone: i > shownFish, breathe: lastFish && i === 1, pop: refilling && i <= shownFish }"
      />
    </div>

    <RulesCard :key="`rules-${round}`" class="rules-intro" />

    <div :key="`board-${round}`" class="board-wrap">
      <Transition name="toast-out" type="transition">
      <p v-if="!started" class="intro-toast timed" aria-live="polite">
        <span>{{ levelLabel }} {{ levelValue }} · {{ puzzle.size }}×{{ puzzle.size }}</span>
        <span class="diff">{{ difficultyName }} <i v-for="i in 4" :key="i" :class="{ on: i <= difficultyDots }" /></span>
      </p>
      </Transition>
      <RegionStrip
        :class="{ 'strip-dying': dying }"
        :size="puzzle.size"
        :found="catRegions"
        :ghosts="ghostRegions"
        :open="openCells"
        :leaving="leaving"
        :patterns="progress.settings.patterns"
        :calm="calm"
        @spot="onSpot"
      />
      <Transition name="caption">
        <p v-if="caption" :key="caption.id" class="caption" dir="auto" role="status">
          <b>{{ caption.name }}</b>{{ caption.rest }}
        </p>
      </Transition>
      <GameBoard
        :puzzle="puzzle"
        :marks="marks"
        :layers="layers"
        :focus-ink="focusInk"
        :pen-active="activeInk === 0"
        :contradictions="contradictions"
        :mistakes="mistakes"
        :mistake-cell="mistakeCell"
        :placement="placement"
        :hinted="hinted"
        :sweep="sweep"
        :erased="erased"
        :refuted="refuted"
        :proof="proof"
        :restored="restored"
        :slip="slip"
        :pressed="pressed"
        :outro="leaving"
        :celebrate="celebrating ? lastCat : null"
        :dying="dying"
        :spot="spot"
        :calm="calm"
        :patterns="progress.settings.patterns"
        @press="onPress"
        @pet="onPet"
        @drag="onDrag"
        @stroke="onStroke"
        @release="onRelease"
        @left="arrive"
      >
        <Transition name="finger">
          <CoachFinger v-if="boardFinger" :x="boardFinger.x" :y="boardFinger.y" :double="boardFinger.double" />
        </Transition>
      </GameBoard>
    </div>

    <div ref="toolsEl" class="tools">
      <Transition name="toast">
        <p v-if="ghostFree" class="ghost-free" dir="auto" role="status">{{ t('ghostFree') }}</p>
      </Transition>
      <Transition name="coach" type="transition">
        <button v-if="coach" :key="coach.key" class="coach" :class="{ 'on-board': coach.finger?.on === 'cell' }" @click="coach.dismiss()">
          <CatFace mood="wink" class="coach-cat" />
          <span>{{ t(coach.key) }}</span>
          <b aria-hidden="true">✕</b>
        </button>
      </Transition>
      <InkBar
        :active="activeInk"
        :focus="focusInk"
        :use="inkUse"
        :broken="shownBroken"
        :hold="revealing > 0"
        :refutable="focusInk > 0 && game.refutable(focusInk) !== null"
        :can-undo="canUndo"
        :nope="nope"
        @pick="onPick"
        @undo="onUndo"
        @erase="onErase"
        @keep="onKeep"
        @cross-out="onCrossOut"
      />
      <Transition name="finger">
        <CoachFinger v-if="toolFinger && coach?.finger" :key="coach.finger.on" :x="toolFinger.x" :y="toolFinger.y" />
      </Transition>
    </div>

    <!-- While the coach talks, its bubble sits here: the power-ups step aside rather than peek out half-covered. -->
    <div class="powers" :class="{ aside: coach !== null }" dir="ltr" :inert="coach !== null">
      <PowerButton :count="progress.powerUps.cat" :label="t('powerCat')" @use="usePower('cat')">
        <CatFace mood="wink" />
      </PowerButton>
      <PowerButton
        :count="progress.powerUps.bulb"
        :label="t('powerBulb')"
        :nudge="idle && progress.powerUps.bulb > 0"
        :flash="bulbFlash"
        @use="usePower('bulb')"
      >
        <BulbIcon />
      </PowerButton>
      <PowerButton :count="progress.powerUps.mouse" :label="t('powerMouse')" @use="usePower('mouse')">
        <MouseIcon />
      </PowerButton>
    </div>

    <Transition name="fade-out">
      <Confetti v-if="celebrating && !leaving && !calm" :delay="CONFETTI_MS" />
    </Transition>

    <FxLayer :placement="placement" :regions="puzzle.regions" :target="pointsEl" :calm="calm" />

    <Transition name="fade-out">
    <ResultOverlay v-if="status === 'won' && showWin && !leaving" :title="t('won')" tone="won">
      <template #art><HugCat happy /></template>
      <p class="sub level-done">{{ mode === 'daily' ? t('dailyDone') : tf('levelDone', { n: playedLevel }) }}</p>
      <!-- Stars fill in reading order: right to left in Arabic. -->
      <div class="stars">
        <svg v-for="i in 3" :key="i" viewBox="0 0 100 100" :class="{ lit: i <= stars }" :style="{ animationDelay: `${300 + i * 260}ms` }">
          <path d="M50 6 L62 36 L94 38 L69 58 L77 90 L50 72 L23 90 L31 58 L6 38 L38 36 Z" />
        </svg>
      </div>
      <p class="sub">
        <bdi dir="ltr">+{{ cardScore }}</bdi> {{ t('points') }} · ⏱ <bdi>{{ timeTaken }}</bdi>
      </p>
      <div v-if="rewards.length > 0" class="rewards">
        <span class="rewards-label" :style="{ animationDelay: `${CHIPS_MS}ms` }">{{ t('rewardsLabel') }}</span>
        <span
          v-for="(power, n) in rewards"
          :key="power"
          class="chip"
          :style="{ animationDelay: `${CHIPS_MS + n * CHIP_STEP_MS}ms` }"
        >
          <CatFace v-if="power === 'cat'" mood="wink" still />
          <BulbIcon v-else-if="power === 'bulb'" />
          <MouseIcon v-else />
          <b dir="ltr">+1</b>
        </span>
      </div>
      <button class="big orange" @click="onNext">{{ mode === 'daily' ? t('home') : t('next') }}</button>
    </ResultOverlay>

    <ResultOverlay v-else-if="status === 'lost' && showLost && !leaving" :title="t('lost')" tone="lost">
      <template #art><HugCat /></template>
      <p class="sub">
        {{ t('left') }}: <b class="left">{{ catsLeft }}</b>
        <CatFace class="sub-cat" />
      </p>
      <button v-if="!continued" class="big primary" @click="getFish">{{ t('getFish') }}</button>
      <button class="big secondary" @click="retry">{{ t('retry') }}</button>
    </ResultOverlay>
    </Transition>

    <SettingsSheet v-if="showSettings" @close="showSettings = false" @reset="onReset" />
  </div>
</template>

<style scoped>
.game {
  position: relative;
  /* The ambient layer sits behind everything in here. */
  isolation: isolate;
  display: flex;
  flex-direction: column;
  padding: calc(4cqw + env(safe-area-inset-top)) 0 6cqw;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 3.2cqw;
}

.round {
  /* At least ~40px on phones. */
  width: 10.4cqw;
  height: 10.4cqw;
  border: none;
  border-radius: 50%;
  background: var(--card);
  box-shadow: var(--shadow);
  color: var(--text);
  display: grid;
  place-items: center;
  padding: 0;
}

.round svg {
  width: 4.9cqw;
}

.stats {
  display: flex;
  gap: 13cqw;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 14cqw;
  line-height: 1;
  color: var(--text);
  font-weight: 600;
}

.label {
  font-size: 4.6cqw;
  font-weight: 500;
}

.value {
  font-size: 6.4cqw;
  margin-top: 0.4cqw;
  /* Equal-width digits in a box wide enough for five: a counting score neither wobbles nor pushes the header. */
  font-variant-numeric: tabular-nums;
  min-width: 5ch;
  text-align: center;
}

/* Out of fish: the cat heads lose their colour along with the board (after the heart breaks). */
.strip-dying {
  filter: grayscale(0.7) brightness(0.95);
  transition: filter 450ms ease-in 650ms;
}

.value.bump {
  animation: bump 0.7s ease-out;
}

.fish {
  align-self: center;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 4.5cqw;
  width: 23.8cqw;
  height: 7.6cqw;
  border-radius: 3.8cqw;
  background: var(--card);
  transition: box-shadow 300ms ease-out;
}

/* The last fish: the pill rings red and the fish breathes, holding on. */
.fish.last {
  box-shadow: inset 0 0 0 0.4cqw rgb(232 50 58 / 0.35);
}

.fish svg {
  width: 7.4cqw;
  margin: 0 -0.5cqw;
}

.fish svg.breathe {
  animation: fish-breathe 1.2s ease-in-out infinite;
}

/* "Get 3 fish": each fish pops back in, overshoots and settles. */
.fish svg.pop {
  animation: fish-pop 300ms backwards;
}

@keyframes fish-breathe {
  50% {
    scale: 1.08;
  }
}

@keyframes fish-pop {
  0% {
    scale: 0;
    animation-timing-function: cubic-bezier(0.2, 0.8, 0.4, 1);
  }
  55% {
    scale: 1.3;
    animation-timing-function: cubic-bezier(0.45, 0, 0.55, 1);
  }
  100% {
    scale: 1;
  }
}

.fish svg {
  overflow: visible;
}

.rules-intro {
  margin-top: 2.4cqw;
  animation: glow 2.2s ease-out;
}

.board-wrap {
  position: relative;
  margin: 6cqw 1.3cqw 0;
}

/* Dark translucent banner across the board, like the original's level toast. */
.intro-toast {
  position: absolute;
  z-index: 5;
  left: -1.3cqw;
  right: -1.3cqw;
  top: 38%;
  margin: 0;
  padding: 2.4cqw 4cqw;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6cqw;
  background: rgb(40 34 38 / 0.82);
  color: #fff;
  font-size: 5cqw;
  font-weight: 600;
  pointer-events: none;
  animation: toast 2.2s ease-in-out 0.45s both;
}

/* The banner gets out of the way as soon as the player starts. */
.toast-out-leave-active {
  animation: none;
  transition: opacity 0.2s;
}

.toast-out-leave-to {
  opacity: 0;
}

.diff {
  display: flex;
  align-items: center;
  gap: 1cqw;
  color: #ffd23f;
  font-size: 4cqw;
}

.diff i {
  width: 2.2cqw;
  height: 2.2cqw;
  border-radius: 50%;
  background: rgb(255 255 255 / 0.25);
}

.diff i.on {
  background: #ffd23f;
}

@keyframes toast {
  0% {
    opacity: 0;
    transform: translateX(8%);
  }
  12%,
  80% {
    opacity: 1;
    transform: none;
  }
  100% {
    opacity: 0;
    transform: translateX(-8%);
    visibility: hidden;
  }
}

.tools {
  position: relative;
  margin-top: 4cqw;
}

/* The bulb's caption: a speech bubble over the cat-head strip, pointing down at the board. */
.caption {
  position: absolute;
  z-index: 6;
  /* Its tail tip rests on the board's top edge (under the strip); a second line grows upwards. */
  bottom: calc(100% - 7.6cqw + 1.4cqw);
  left: 50%;
  translate: -50% 0;
  box-sizing: border-box;
  width: max-content;
  max-width: 84cqw;
  margin: 0;
  padding: 1.6cqw 3.4cqw;
  border-radius: 3cqw;
  background: #fff;
  box-shadow: var(--shadow), 0 0.4cqw 1.6cqw rgb(150 105 85 / 0.18);
  color: var(--text);
  font-size: 3.6cqw;
  font-weight: 500;
  line-height: 1.3;
  text-align: center;
  pointer-events: none;
}

.caption b {
  font-weight: 800;
  color: #c8741c;
}

.caption::after {
  content: '';
  position: absolute;
  bottom: -1.2cqw;
  left: 50%;
  width: 2.6cqw;
  height: 2.6cqw;
  background: #fff;
  border-radius: 0 0 0.5cqw 0;
  transform: translateX(-50%) rotate(45deg);
}

/* Once the outline has started to draw, it fades in with a small rise; it fades out with the hint. */
.caption-enter-active {
  transition:
    opacity 200ms ease-out 150ms,
    transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1) 150ms;
}

.caption-leave-active {
  transition: opacity 200ms ease-in;
}

.caption-enter-from {
  opacity: 0;
  transform: translateY(1.2cqw) scale(0.96);
}

.caption-leave-to {
  opacity: 0;
}

/* The paw comes down onto the screen from above (bigger, see-through), and lifts away when done. */
.finger-enter-active {
  transition:
    opacity 260ms ease-out 500ms,
    scale 420ms cubic-bezier(0.34, 1.4, 0.64, 1) 500ms;
}

.finger-leave-active {
  transition:
    opacity 200ms ease-in,
    scale 200ms ease-in;
}

.finger-enter-from,
.finger-leave-to {
  opacity: 0;
  scale: 1.4;
}

/* "Test cat: costs no fish": a little toast over the ink bar. */
.ghost-free {
  position: absolute;
  z-index: 6;
  bottom: calc(100% + 1.6cqw);
  left: 50%;
  translate: -50% 0;
  width: max-content;
  max-width: 80cqw;
  margin: 0;
  padding: 1.4cqw 3.4cqw;
  border-radius: 999px;
  background: rgb(40 34 38 / 0.86);
  color: #fff;
  font-size: 3.4cqw;
  font-weight: 600;
  pointer-events: none;
}

.toast-enter-active {
  transition:
    opacity 180ms ease-out,
    transform 360ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.toast-leave-active {
  transition:
    opacity 220ms ease-in,
    transform 220ms ease-in;
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(1.6cqw) scale(0.9);
}

.toast-leave-to {
  opacity: 0;
  transform: translateY(-1cqw);
}

.coach {
  position: absolute;
  z-index: 6;
  top: calc(100% + 2.6cqw);
  left: 4cqw;
  right: 4cqw;
  display: flex;
  align-items: center;
  gap: 2.4cqw;
  padding: 2cqw 3cqw;
  border: none;
  border-radius: 3cqw;
  background: #fffaf3;
  color: var(--text);
  font-size: 3.7cqw;
  font-weight: 600;
  line-height: 1.3;
  text-align: start;
  box-shadow: 0 1.2cqw 3cqw rgb(120 80 60 / 0.25), 0 0 0 0.5cqw #f6a13a;
  animation: coach-bob 2.4s ease-in-out infinite;
}

/* Speech-bubble tail pointing up at the ink bar / board. */
.coach::after {
  content: '';
  position: absolute;
  top: -2.2cqw;
  left: 50%;
  width: 3.6cqw;
  height: 3.6cqw;
  background: #fffaf3;
  box-shadow: -0.5cqw -0.5cqw 0 #f6a13a;
  transform: translateX(-50%) rotate(45deg);
}

/* When the paw is on the board, the bubble doesn't point at the ink bar. */
.coach.on-board::after {
  display: none;
}

.coach span {
  flex: 1;
}

.coach b {
  font-size: 3.4cqw;
  opacity: 0.5;
}

.coach-cat {
  flex: none;
  width: 9cqw;
}

.coach-enter-active,
.coach-leave-active {
  transition: opacity 0.25s, transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.coach-enter-from,
.coach-leave-to {
  opacity: 0;
  transform: translateY(3cqw) scale(0.9);
}

@keyframes coach-bob {
  50% {
    transform: translateY(-0.8cqw);
  }
}

.powers {
  display: flex;
  justify-content: center;
  gap: 10.7cqw;
  margin-top: 7cqw;
  animation: fade-in 0.6s 0.5s backwards;
  transition:
    opacity 0.25s ease-out,
    transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.powers.aside {
  opacity: 0;
  transform: translateY(3cqw) scale(0.94);
  pointer-events: none;
}

.sub {
  margin: 0 0 4cqw;
  color: #fff;
  font-size: 5.4cqw;
  display: flex;
  align-items: center;
  gap: 1.5cqw;
}

.left {
  color: #f0533c;
}

/* What the level granted: a chip per power-up, popping in after the stars. */
.rewards {
  display: flex;
  align-items: center;
  gap: 2cqw;
  margin: -2cqw 0 4cqw;
}

.rewards-label {
  color: rgb(255 255 255 / 0.75);
  font-size: 4cqw;
  font-weight: 600;
  animation: fade-in 300ms ease-out backwards;
}

.chip {
  display: flex;
  align-items: center;
  gap: 0.8cqw;
  padding-block: 0.8cqw;
  padding-inline: 1.2cqw 2.6cqw;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 0.6cqw 0 rgb(0 0 0 / 0.18);
  animation: chip-pop 300ms backwards;
}

.chip svg {
  width: 7.4cqw;
}

.chip b {
  color: #f28a1e;
  font-size: 4.8cqw;
  font-weight: 800;
}

/* Overshoots to 1.2, then springs back and settles. */
@keyframes chip-pop {
  0% {
    transform: scale(0);
    opacity: 0;
    animation-timing-function: cubic-bezier(0.2, 0.8, 0.4, 1);
  }
  55% {
    transform: scale(1.2);
    opacity: 1;
    animation-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  100% {
    transform: scale(1);
  }
}

.sub-cat {
  width: 7cqw;
}

.stars {
  display: flex;
  align-items: flex-end;
  gap: 2cqw;
  margin-top: -2cqw;
}

.stars svg {
  width: 15cqw;
  fill: #5b5560;
  stroke: #fff;
  stroke-width: 5;
  stroke-linejoin: round;
  animation: star-pop 0.45s cubic-bezier(0.34, 1.7, 0.64, 1) backwards;
}

.stars svg:nth-child(2) {
  width: 19cqw;
}

.stars svg.lit {
  fill: #ffc531;
  filter: drop-shadow(0 0 2cqw rgb(255 197 49 / 0.6));
}

@keyframes star-pop {
  from {
    transform: scale(0) rotate(-40deg);
    opacity: 0;
  }
}

@keyframes bump {
  30% {
    transform: scale(1.25);
    color: #f7a21e;
  }
}

@keyframes crumble {
  0% {
    transform: scale(1.2) rotate(0);
    filter: brightness(1.4);
  }
  30% {
    transform: scale(1.1) rotate(-14deg);
  }
  60% {
    transform: scale(1.05) rotate(10deg);
  }
}

@keyframes glow {
  0%,
  60% {
    box-shadow: 0 0 0 0.7cqw #f6a13a;
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(3cqw);
  }
}

/* Calm mode: nothing loops (the last fish's breath, the coach's bob, nudges, the win's rays and cat). */
.game.calm .fish svg.breathe,
.game.calm .coach,
.game.calm :deep(.nudge),
.game.calm :deep(.act.crossOut),
.game.calm :deep(.hug *),
.game.calm :deep(.art.won::before) {
  animation: none;
}

/* The result card and confetti step aside as the board leaves; taps go through to skip it. */
.fade-out-leave-active {
  transition: opacity 160ms ease-in;
  pointer-events: none;
}

.fade-out-leave-to {
  opacity: 0;
}

/*
 * Short screens (or phones wider than tall enough): tighter spacing, rules
 * as pictures only, and on the shortest ones no rules card at all, so the
 * ink bar and the power-ups always fit without scrolling.
 */
@media (max-height: 700px), (max-width: 480px) and (min-aspect-ratio: 1/2) {
  .board-wrap {
    margin-top: 3cqw;
  }

  /* The bulb's caption stays short, so it doesn't climb over the rules. */
  .caption {
    max-width: 94cqw;
    font-size: 3.2cqw;
  }

  .tools {
    margin-top: 2.5cqw;
  }

  .powers {
    margin-top: 4cqw;
  }
}

@media (max-width: 480px) and (min-aspect-ratio: 10/19) {
  .rules-intro {
    display: none;
  }
}
</style>
