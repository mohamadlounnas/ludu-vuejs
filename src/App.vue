<script setup lang="ts">
import { onBeforeUnmount, ref, watch, watchEffect } from 'vue'
import { progress } from './game/progress'
import GameScreen from './components/GameScreen.vue'
import HomeScreen from './components/HomeScreen.vue'
import ArtGallery from './components/dev/ArtGallery.vue'
import SoundLab from './components/dev/SoundLab.vue'

type Screen = 'home' | 'level' | 'daily'

/*
 * Screens live in the URL hash (#level, #daily), so the phone's Back
 * button and the browser's go home instead of leaving the game, and a link
 * can open straight into the daily.
 */
const fromHash = (): Screen => (location.hash === '#level' ? 'level' : location.hash === '#daily' ? 'daily' : 'home')
const screen = ref<Screen>(fromHash())
/** Whether this visit added the game's history entry (so Back can simply step back to home). */
let pushed = false

const open = (next: 'level' | 'daily') => {
  pushed = true
  location.hash = next
}

const home = () => {
  if (pushed && screen.value !== 'home') {
    pushed = false
    history.back()
    return
  }
  // Opened straight into a game: drop the hash without leaving the site.
  history.replaceState(history.state, '', location.pathname + location.search)
  screen.value = 'home'
}

const onHashChange = () => (screen.value = fromHash())
// Every screen opens at its top, whatever the last one was scrolled to.
watch(screen, () => window.scrollTo(0, 0))
window.addEventListener('hashchange', onHashChange)
onBeforeUnmount(() => window.removeEventListener('hashchange', onHashChange))
const gallery = new URLSearchParams(location.search).has('gallery')
const soundlab = new URLSearchParams(location.search).has('soundlab')

// A player who turns calm mode off gets the full motion back, whatever the system asks (see style.css).
watchEffect(() => document.documentElement.classList.toggle('calm', progress.settings.calm))
</script>

<template>
  <ArtGallery v-if="gallery" />
  <SoundLab v-else-if="soundlab" />
  <div v-else class="screen">
    <Transition name="screen" mode="out-in">
      <HomeScreen v-if="screen === 'home'" @play="open('level')" @daily="open('daily')" />
      <GameScreen v-else :key="screen" :mode="screen" @back="home" />
    </Transition>
  </div>
</template>

<style scoped>
/* Screens: the old one steps back and fades, the new one rises into place. */
.screen-leave-active {
  transition:
    opacity 100ms ease-in,
    transform 100ms ease-in;
}

.screen-leave-to {
  opacity: 0;
  transform: scale(0.97);
}

.screen-enter-active {
  transition:
    opacity 160ms cubic-bezier(0.2, 0.8, 0.3, 1),
    transform 160ms cubic-bezier(0.2, 0.8, 0.3, 1);
}

.screen-enter-from {
  opacity: 0;
  transform: translateY(3cqw);
}
</style>
