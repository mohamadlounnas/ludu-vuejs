<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { progress } from './game/progress'
import GameScreen from './components/GameScreen.vue'
import HomeScreen from './components/HomeScreen.vue'
import ArtGallery from './components/dev/ArtGallery.vue'

const screen = ref<'home' | 'level' | 'daily'>('home')
const gallery = new URLSearchParams(location.search).has('gallery')

// A player who turns calm mode off gets the full motion back, whatever the system asks (see style.css).
watchEffect(() => document.documentElement.classList.toggle('calm', progress.settings.calm))
</script>

<template>
  <ArtGallery v-if="gallery" />
  <div v-else class="screen">
    <Transition name="screen" mode="out-in">
      <HomeScreen v-if="screen === 'home'" @play="screen = 'level'" @daily="screen = 'daily'" />
      <GameScreen v-else :mode="screen" @back="screen = 'home'" />
    </Transition>
  </div>
</template>

<style scoped>
/* Screens: the old one steps back and fades, the new one rises into place. */
.screen-leave-active {
  transition:
    opacity 160ms ease-in,
    transform 160ms ease-in;
}

.screen-leave-to {
  opacity: 0;
  transform: scale(0.97);
}

.screen-enter-active {
  transition:
    opacity 240ms cubic-bezier(0.2, 0.8, 0.3, 1),
    transform 240ms cubic-bezier(0.2, 0.8, 0.3, 1);
}

.screen-enter-from {
  opacity: 0;
  transform: translateY(3cqw);
}
</style>
