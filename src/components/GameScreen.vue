<script setup lang="ts">
import { ref, watch } from 'vue'
import { generatePuzzle } from '../game/generator'
import { pointsForWin, seedForLevel, sizeForLevel } from '../game/levels'
import { progress, rewardLevel, type PowerUp } from '../game/progress'
import { MAX_FISH, useGame } from '../game/useGame'
import { t } from '../i18n'
import GameBoard from './GameBoard.vue'
import AppIcons from './icons/AppIcons.vue'
import BulbIcon from './icons/BulbIcon.vue'
import CatFace from './icons/CatFace.vue'
import FishIcon from './icons/FishIcon.vue'
import MouseIcon from './icons/MouseIcon.vue'
import ModalCard from './ModalCard.vue'
import PowerButton from './PowerButton.vue'
import RegionStrip from './RegionStrip.vue'
import RulesCard from './RulesCard.vue'
import SettingsSheet from './SettingsSheet.vue'

const emit = defineEmits<{ back: [] }>()

const puzzleForLevel = (level: number) => generatePuzzle(sizeForLevel(level), seedForLevel(level))

const game = useGame(puzzleForLevel(progress.level))
const { puzzle, marks, fish, shaking, status, catRegions } = game

const playedLevel = ref(progress.level)
const gained = ref(0)
const showSettings = ref(false)

watch(status, (s) => {
  if (s !== 'won') return
  gained.value = pointsForWin(puzzle.value.size, fish.value)
  progress.points += gained.value
  rewardLevel(playedLevel.value)
  progress.level = playedLevel.value + 1
})

const startLevel = () => {
  playedLevel.value = progress.level
  game.load(puzzleForLevel(progress.level))
}

const usePower = (power: PowerUp) => {
  if (progress.powerUps[power] === 0) return
  const used = { cat: game.revealCat, bulb: game.hint, mouse: game.clearMistakes }[power]()
  if (used) progress.powerUps[power]--
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
          <span class="label">{{ t('level') }}</span>
          <span class="value">{{ playedLevel }}</span>
        </div>
        <div class="stat">
          <span class="label">{{ t('points') }}</span>
          <span class="value">{{ progress.points }}</span>
        </div>
      </div>
      <button class="round" :aria-label="t('settings')" @click="showSettings = true">
        <AppIcons name="gear" />
      </button>
    </header>

    <div class="fish" dir="ltr" :aria-label="`${t('fishLeft')}: ${fish}`">
      <FishIcon v-for="i in MAX_FISH" :key="i" :lost="i > fish" />
    </div>

    <RulesCard />

    <div class="board-wrap">
      <RegionStrip :size="puzzle.size" :found="catRegions" />
      <GameBoard :puzzle="puzzle" :marks="marks" :shaking="shaking" @press="game.press" @drag="game.drag" />
    </div>

    <div class="powers" dir="ltr">
      <PowerButton :count="progress.powerUps.cat" :label="t('powerCat')" @use="usePower('cat')">
        <CatFace wink />
      </PowerButton>
      <PowerButton :count="progress.powerUps.bulb" :label="t('powerBulb')" @use="usePower('bulb')">
        <BulbIcon />
      </PowerButton>
      <PowerButton :count="progress.powerUps.mouse" :label="t('powerMouse')" @use="usePower('mouse')">
        <MouseIcon />
      </PowerButton>
    </div>

    <ModalCard v-if="status === 'won'">
      <CatFace wink class="modal-art" />
      <h2>{{ t('won') }}</h2>
      <p>{{ t('wonText') }} · <bdi>+{{ gained }}</bdi> {{ t('points') }}</p>
      <button class="pill primary" @click="startLevel">{{ t('next') }}</button>
    </ModalCard>

    <ModalCard v-else-if="status === 'lost'">
      <FishIcon lost class="modal-art" />
      <h2>{{ t('lost') }}</h2>
      <p>{{ t('lostText') }}</p>
      <button class="pill primary" @click="game.load(puzzle)">{{ t('retry') }}</button>
    </ModalCard>

    <SettingsSheet v-if="showSettings" @close="showSettings = false" @reset="showSettings = false; startLevel()" />
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

.rules {
  margin-top: 2.4cqw;
}

.board-wrap {
  margin: 6cqw 1.3cqw 0;
}

.powers {
  display: flex;
  justify-content: center;
  gap: 10.7cqw;
  margin-top: 8.4cqw;
}

.modal-art {
  width: 22cqw;
}

h2 {
  margin: 0;
  font-size: 7cqw;
}

p {
  margin: 0;
  font-size: 4cqw;
}
</style>
