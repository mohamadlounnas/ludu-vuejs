<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { generatePuzzle } from '../game/generator'
import { bandForLevel, DAILY_BAND, DAILY_SIZE, seedForLevel, sizeForLevel } from '../game/levels'
import { packedLevel } from '../levels/pack'
import { clearBoard, loadBoard, saveBoard } from '../game/boardSave'
import { completeDaily, dailyDone, dayKey, progress, rewardLevel, type PowerUp } from '../game/progress'
import { dailySeed } from '../game/rng'
import { haptic, sfx } from '../game/sfx'
import {
  INTRO_STEP_MS,
  LAND_IMPACT_MS,
  MAX_FISH,
  MISTAKE_MS,
  revealAt,
  useGame,
  type PressOutcome,
  type Slot,
} from '../game/useGame'
import { t } from '../i18n'
import GameBoard from './GameBoard.vue'
import InkBar from './InkBar.vue'
import AppIcons from './icons/AppIcons.vue'
import BulbIcon from './icons/BulbIcon.vue'
import CatFace from './icons/CatFace.vue'
import FishIcon from './icons/FishIcon.vue'
import MouseIcon from './icons/MouseIcon.vue'
import HugCat from './icons/HugCat.vue'
import Confetti from './Confetti.vue'
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

const game = useGame(nextPuzzle())

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

// ---- Tutorial bubbles: basics on the first levels, test inks later ----

const hasMark = (m: string) => marks.value.includes(m as never)
const coach = computed<{ key: 'tipTap' | 'tipCat' | 'tipInks'; dismiss: () => void } | null>(() => {
  if (status.value !== 'playing') return null
  if (props.mode === 'level' && !progress.tips.basics && playedLevel.value <= 2) {
    const done = () => (progress.tips.basics = true)
    if (!hasMark('x')) return { key: 'tipTap', dismiss: done }
    if (!hasMark('cat')) return { key: 'tipCat', dismiss: done }
  }
  if (!progress.tips.inks && (props.mode === 'daily' || playedLevel.value >= 6)) {
    return { key: 'tipInks', dismiss: () => (progress.tips.inks = true) }
  }
  return null
})
watch(
  () => marks.value.includes('cat'),
  (anyCat) => anyCat && playedLevel.value <= 2 && (progress.tips.basics = true),
)
watch(activeInk, (inkIndex) => inkIndex > 0 && (progress.tips.inks = true))

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
  props.mode === 'daily' ? new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) : playedLevel.value,
)

// Score counts up like the original's points counter.
const shownScore = ref(0)
const bump = ref(0)
watch(score, (to, from) => {
  if (to < from) {
    shownScore.value = to
    return
  }
  bump.value++
  const start = performance.now()
  const tick = (now: number) => {
    const k = Math.min(1, (now - start) / 700)
    shownScore.value = Math.round(from + (to - from) * (1 - (1 - k) ** 3))
    if (k < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})

// ---- Feedback: sounds and haptics for every action ----

/** The last tap and what it did (the board wiggles a blocked cell). */
const pressed = shallowRef<{ id: number; cell: number; outcome: PressOutcome } | null>(null)
let pressId = 0

/** Cells painted by the current drag: each scratch sounds a little higher. */
let dragSteps = 0

const onPress = (cell: number) => {
  const outcome = game.press(cell)
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
  sfx.cat(LAND_IMPACT_MS)
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

const onKeep = (ink: number) => game.keepInk(ink)
const onCrossOut = (ink: number) => game.crossOutGuess(ink)

// A bump on the wrong cat, then another as the heart cracks (650ms in).
watch(mistakeCell, (cell) => {
  if (cell === null) return
  sfx.wrong()
  haptic([35, 615, 60])
})

// ---- Win: cats hop and confetti falls, then the result card with stars ----

const celebrating = ref(false)
const showWin = ref(false)
const showLost = ref(false)

// A fish breaks only when the heart does (the broken heart shows at ~650 ms).
const shownFish = ref(fish.value)
watch(fish, (to, from) => {
  if (to < from) window.setTimeout(() => (shownFish.value = fish.value), 650)
  else shownFish.value = to
})

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
const startedAt = ref(Date.now() - (resumed?.elapsedMs ?? 0))
const timeTaken = ref('')
const stars = ref(0)
// The board builds itself on every (re)start; its plinks climb with it.
const introSound = () => sfx.intro(2 * puzzle.value.size - 1, INTRO_STEP_MS)
onMounted(introSound)

watch(round, () => {
  introSound()
  startedAt.value = Date.now()
  started.value = false
  shownBroken.value = new Set()
  celebrating.value = false
  showWin.value = false
  showLost.value = false
  shownFish.value = fish.value
})

watch(status, (s) => {
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
  clearBoard(props.mode)
  const secs = Math.round((Date.now() - startedAt.value) / 1000)
  timeTaken.value = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
  // A refilled ("Get 3 fish") win is worth one star.
  stars.value = continued.value ? 1 : fish.value
  celebrating.value = true
  sfx.win()
  haptic([30, 50, 30, 50, 60])
  setTimeout(() => {
    showWin.value = true
    for (let i = 0; i < stars.value; i++) setTimeout(() => sfx.star(i), 450 + i * 260)
  }, 1500)
  if (props.mode === 'daily') {
    // Replaying a finished daily is for fun: no extra points.
    if (!dailyDone()) progress.points += score.value
    completeDaily()
    return
  }
  progress.points += score.value
  rewardLevel(playedLevel.value)
  progress.level = playedLevel.value + 1
})

// ---- Level to level: the board leaves (a tap skips it), then the next one builds itself ----

const leaving = ref(false)
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
  arrive()
}

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
  game.continueWithFish()
}

const usePower = (power: PowerUp) => {
  if (progress.powerUps[power] === 0) return
  sfx.ui()
  const used = { cat: game.revealCat, bulb: game.hint, mouse: game.clearMistakes }[power]()
  if (!used) return
  progress.powerUps[power]--
  if (power === 'bulb') sfx.hint()
  if (power === 'mouse') sfx.mouse()
}

const onUndo = () => game.undo() && sfx.undo()
const onErase = (inkIndex: number) => game.eraseInk(inkIndex) && sfx.erase()

const onReset = () => {
  showSettings.value = false
  if (props.mode === 'level') nextLevel()
}
</script>

<template>
  <div class="game" @pointerdown.capture="skipOutro">
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
          <span :key="bump" class="value" :class="{ bump: bump > 0 }">{{ shownScore }}</span>
        </div>
      </div>
      <button class="round" :aria-label="t('settings')" @click="showSettings = true">
        <AppIcons name="gear" />
      </button>
    </header>

    <div class="fish" dir="ltr" :aria-label="`${t('fishLeft')}: ${fish}`">
      <FishIcon v-for="i in MAX_FISH" :key="i" :lost="i > shownFish" :class="{ gone: i > shownFish }" />
    </div>

    <RulesCard :key="`rules-${round}`" class="rules-intro" />

    <div :key="`board-${round}`" class="board-wrap">
      <Transition name="toast-out" type="transition">
      <p v-if="!started" class="intro-toast" aria-live="polite">
        <span>{{ levelLabel }} {{ levelValue }} · {{ puzzle.size }}×{{ puzzle.size }}</span>
        <span class="diff">{{ difficultyName }} <i v-for="i in 4" :key="i" :class="{ on: i <= difficultyDots }" /></span>
      </p>
      </Transition>
      <RegionStrip :size="puzzle.size" :found="catRegions" :ghosts="ghostRegions" :leaving="leaving" />
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
        :pressed="pressed"
        :outro="leaving"
        :class="{ celebrate: celebrating }"
        @press="onPress"
        @drag="onDrag"
        @release="onRelease"
        @left="arrive"
      />
    </div>

    <div class="tools">
      <Transition name="coach">
        <button v-if="coach" :key="coach.key" class="coach" @click="coach.dismiss()">
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
    </div>

    <div class="powers" dir="ltr">
      <PowerButton :count="progress.powerUps.cat" :label="t('powerCat')" @use="usePower('cat')">
        <CatFace mood="wink" />
      </PowerButton>
      <PowerButton :count="progress.powerUps.bulb" :label="t('powerBulb')" :nudge="idle && progress.powerUps.bulb > 0" @use="usePower('bulb')">
        <BulbIcon />
      </PowerButton>
      <PowerButton :count="progress.powerUps.mouse" :label="t('powerMouse')" @use="usePower('mouse')">
        <MouseIcon />
      </PowerButton>
    </div>

    <Transition name="fade-out">
      <Confetti v-if="celebrating && !leaving" />
    </Transition>

    <Transition name="fade-out">
    <ResultOverlay v-if="status === 'won' && showWin && !leaving" :title="t('won')" tone="won">
      <template #art><HugCat happy /></template>
      <div class="stars" dir="ltr">
        <svg v-for="i in 3" :key="i" viewBox="0 0 100 100" :class="{ lit: i <= stars }" :style="{ animationDelay: `${300 + i * 260}ms` }">
          <path d="M50 6 L62 36 L94 38 L69 58 L77 90 L50 72 L23 90 L31 58 L6 38 L38 36 Z" />
        </svg>
      </div>
      <p class="sub">
        <bdi>+{{ score }}</bdi> {{ t('points') }} · ⏱ <bdi>{{ timeTaken }}</bdi>
      </p>
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
  width: 9.2cqw;
  height: 9.2cqw;
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
}

.fish svg {
  width: 7.4cqw;
  margin: 0 -0.5cqw;
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
