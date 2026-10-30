<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { generatePuzzle } from '../game/generator'
import { bandForLevel, DAILY_BAND, DAILY_SIZE, seedForLevel, sizeForLevel } from '../game/levels'
import { packedLevel } from '../levels/pack'
import { completeDaily, progress, rewardLevel, type PowerUp } from '../game/progress'
import { dailySeed } from '../game/rng'
import { haptic, sfx } from '../game/sfx'
import { MAX_FISH, useGame } from '../game/useGame'
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
  ink,
  activeInk,
  history,
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
  round,
  status,
  catRegions,
  catsLeft,
} = game

const showSettings = ref(false)
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

const onPress = (cell: number) => {
  const before = marks.value[cell]
  game.press(cell)
  const after = marks.value[cell]
  if (after === before) return
  if (after === 'x') {
    sfx.x()
    haptic(8)
  } else if (after === 'empty') sfx.erase()
}

let lastDragSound = 0
const onDrag = (cell: number) => {
  const before = marks.value[cell]
  game.drag(cell)
  if (marks.value[cell] !== before && performance.now() - lastDragSound > 45) {
    lastDragSound = performance.now()
    if (marks.value[cell] === 'x') sfx.x()
    else sfx.erase()
  }
}

watch(placement, (p) => {
  if (!p) return
  if (p.kind === 'ghost') {
    sfx.ghost()
    return
  }
  sfx.cat()
  haptic(25)
  for (const c of p.clears) sfx.clear(c.delay)
})

watch(mistakeCell, (cell) => {
  if (cell === null) return
  sfx.wrong()
  haptic([40, 60, 90])
})

// ---- Win: cats hop and confetti falls, then the result card with stars ----

const celebrating = ref(false)
const showWin = ref(false)
const startedAt = ref(Date.now())
const timeTaken = ref('')
const stars = ref(0)
watch(round, () => {
  startedAt.value = Date.now()
  celebrating.value = false
  showWin.value = false
})

watch(status, (s) => {
  if (s === 'lost') {
    sfx.lose()
    haptic([60, 80, 120])
  }
  if (s !== 'won') return
  const secs = Math.round((Date.now() - startedAt.value) / 1000)
  timeTaken.value = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
  stars.value = fish.value
  celebrating.value = true
  sfx.win()
  haptic([30, 50, 30, 50, 60])
  setTimeout(() => {
    showWin.value = true
    for (let i = 0; i < stars.value; i++) setTimeout(() => sfx.star(i), 450 + i * 260)
  }, 1500)
  progress.points += score.value
  if (props.mode === 'daily') {
    completeDaily()
    return
  }
  rewardLevel(playedLevel.value)
  progress.level = playedLevel.value + 1
})

const nextLevel = () => {
  if (props.mode === 'daily') {
    emit('back')
    return
  }
  playedLevel.value = progress.level
  game.load(nextPuzzle())
}

const retry = () => game.load(puzzle.value)

const usePower = (power: PowerUp) => {
  if (progress.powerUps[power] === 0) return
  const used = { cat: game.revealCat, bulb: game.hint, mouse: game.clearMistakes }[power]()
  if (!used) return
  progress.powerUps[power]--
  if (power === 'bulb') sfx.hint()
  if (power === 'mouse') sfx.erase()
}

const onUndo = () => game.undo() && sfx.undo()
const onErase = (inkIndex: number) => game.eraseInk(inkIndex) && sfx.erase()

const onReset = () => {
  showSettings.value = false
  if (props.mode === 'level') nextLevel()
}
</script>

<template>
  <div class="game">
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
      <FishIcon v-for="i in MAX_FISH" :key="i" :lost="i > fish" :class="{ gone: i > fish }" />
    </div>

    <RulesCard :key="`rules-${round}`" class="rules-intro" />

    <div :key="`board-${round}`" class="board-wrap">
      <RegionStrip :size="puzzle.size" :found="catRegions" :ghosts="ghostRegions" />
      <GameBoard
        :puzzle="puzzle"
        :marks="marks"
        :ink="ink"
        :dead="contradictions.dead"
        :clash="contradictions.clash"
        :mistakes="mistakes"
        :mistake-cell="mistakeCell"
        :placement="placement"
        :hinted="hinted"
        :class="{ celebrate: celebrating }"
        @press="onPress"
        @drag="onDrag"
      />
    </div>

    <div class="tools">
      <InkBar
        :active="activeInk"
        :use="inkUse"
        :broken="contradictions.inks"
        :can-undo="history.length > 0"
        :warning="contradictions.dead.length + contradictions.clash.length > 0 ? t('contradictionShort') : ''"
        @pick="game.setInk"
        @undo="onUndo"
        @erase="onErase"
      />
    </div>

    <div class="powers" dir="ltr">
      <PowerButton :count="progress.powerUps.cat" :label="t('powerCat')" @use="usePower('cat')">
        <CatFace mood="wink" />
      </PowerButton>
      <PowerButton :count="progress.powerUps.bulb" :label="t('powerBulb')" @use="usePower('bulb')">
        <BulbIcon />
      </PowerButton>
      <PowerButton :count="progress.powerUps.mouse" :label="t('powerMouse')" @use="usePower('mouse')">
        <MouseIcon />
      </PowerButton>
    </div>

    <Confetti v-if="celebrating" />

    <ResultOverlay v-if="status === 'won' && showWin" :title="t('won')" tone="won">
      <template #art><HugCat happy /></template>
      <div class="stars" dir="ltr">
        <svg v-for="i in 3" :key="i" viewBox="0 0 100 100" :class="{ lit: i <= stars }" :style="{ animationDelay: `${300 + i * 260}ms` }">
          <path d="M50 6 L62 36 L94 38 L69 58 L77 90 L50 72 L23 90 L31 58 L6 38 L38 36 Z" />
        </svg>
      </div>
      <p class="sub">
        <bdi>+{{ score }}</bdi> {{ t('points') }} · ⏱ <bdi>{{ timeTaken }}</bdi>
      </p>
      <button class="big orange" @click="nextLevel">{{ mode === 'daily' ? t('home') : t('next') }}</button>
    </ResultOverlay>

    <ResultOverlay v-else-if="status === 'lost'" :title="t('lost')" tone="lost">
      <template #art><HugCat /></template>
      <p class="sub">
        {{ t('left') }}: <b class="left">{{ catsLeft }}</b>
        <CatFace class="sub-cat" />
      </p>
      <button v-if="!continued" class="big primary" @click="game.continueWithFish()">{{ t('getFish') }}</button>
      <button class="big secondary" @click="retry">{{ t('retry') }}</button>
    </ResultOverlay>

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

.fish .gone {
  animation: crumble 0.6s ease-out;
}

.rules-intro {
  margin-top: 2.4cqw;
  animation: glow 2.2s ease-out;
}

.board-wrap {
  margin: 6cqw 1.3cqw 0;
}

.tools {
  position: relative;
  margin-top: 4cqw;
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
</style>
