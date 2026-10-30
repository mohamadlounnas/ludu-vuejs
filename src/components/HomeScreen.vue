<script setup lang="ts">
import { ref } from 'vue'
import { progress } from '../game/progress'
import { t } from '../i18n'
import AppIcons from './icons/AppIcons.vue'
import CatFace from './icons/CatFace.vue'
import SettingsSheet from './SettingsSheet.vue'

defineEmits<{ play: [] }>()
const showSettings = ref(false)
</script>

<template>
  <div class="home">
    <button class="round gear" :aria-label="t('settings')" @click="showSettings = true">
      <AppIcons name="gear" />
    </button>
    <CatFace wink class="hero" />
    <h1>{{ t('title') }}</h1>
    <p class="how">{{ t('howTo') }}</p>
    <button class="pill primary play" @click="$emit('play')">{{ t('play') }} · {{ t('level') }} {{ progress.level }}</button>
    <p class="points">{{ t('points') }}: {{ progress.points }}</p>
    <SettingsSheet v-if="showSettings" @close="showSettings = false" @reset="showSettings = false" />
  </div>
</template>

<style scoped>
.home {
  min-height: 100vh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4cqw;
  padding: 6cqw;
  position: relative;
}

.gear {
  position: absolute;
  top: 4cqw;
  right: 3.2cqw;
  width: 9.2cqw;
  height: 9.2cqw;
  border: none;
  border-radius: 50%;
  background: var(--card);
  box-shadow: var(--shadow);
  color: var(--text);
  display: grid;
  place-items: center;
}

.gear svg {
  width: 4.9cqw;
}

.hero {
  width: 40cqw;
  animation: bob 2.4s ease-in-out infinite;
}

h1 {
  margin: 0;
  font-size: 10cqw;
  line-height: 1.1;
}

.how,
.points {
  margin: 0;
  font-size: 4cqw;
  text-align: center;
}

.play {
  font-size: 5.5cqw;
  padding: 3cqw 9cqw;
}

@keyframes bob {
  50% {
    transform: translateY(-2cqw) rotate(-3deg);
  }
}
</style>
