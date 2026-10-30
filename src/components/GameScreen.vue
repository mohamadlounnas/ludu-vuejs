<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { generatePuzzle } from '../game/generator'
import { bandForLevel, DAILY_BAND, DAILY_SIZE, seedForLevel, sizeForLevel } from '../game/levels'
import { packedLevel } from '../levels/pack'
import { completeDaily, progress, rewardLevel, type PowerUp } from '../game/progress'
import { dailySeed } from '../game/rng'
import { MAX_FISH, useGame } from '../game/useGame'
import { t } from '../i18n'
import GameBoard from './GameBoard.vue'
import AppIcons from './icons/AppIcons.vue'
import BulbIcon from './icons/BulbIcon.vue'
import CatFace from './icons/CatFace.vue'
import FishIcon from './icons/FishIcon.vue'
import MouseIcon from './icons/MouseIcon.vue'
import SadCat from './icons/SadCat.vue'
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
const { puzzle, marks, mistakes, fish, score, continued, mistakeCell, placement, hinted, round, status, catRegions, catsLeft } =
  game

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

watch(status, (s) => {
  if (s !== 'won') return
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
  if (used) progress.powerUps[power]--
}

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
      <RegionStrip :size="puzzle.size" :found="catRegions" />
      <GameBoard
        :puzzle="puzzle"
        :marks="marks"
        :mistakes="mistakes"
        :mistake-cell="mistakeCell"
        :placement="placement"
        :hinted="hinted"
        @press="game.press"
        @drag="game.drag"
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

    <ResultOverlay v-if="status === 'won'" :title="t('won')" tone="won">
      <template #art><CatFace mood="wink" /></template>
      <p class="sub">{{ t('wonText') }} · <bdi>+{{ score }}</bdi> {{ t('points') }}</p>
      <button class="big orange" @click="nextLevel">{{ mode === 'daily' ? t('home') : t('next') }}</button>
    </ResultOverlay>

    <ResultOverlay v-else-if="status === 'lost'" :title="t('lost')" tone="lost">
      <template #art><SadCat /></template>
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

.powers {
  display: flex;
  justify-content: center;
  gap: 10.7cqw;
  margin-top: 8.4cqw;
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
