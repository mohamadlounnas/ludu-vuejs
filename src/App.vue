<script setup lang="ts">
import { ref } from 'vue'
import GameScreen from './components/GameScreen.vue'
import HomeScreen from './components/HomeScreen.vue'
import ArtGallery from './components/dev/ArtGallery.vue'

const screen = ref<'home' | 'level' | 'daily'>('home')
const gallery = new URLSearchParams(location.search).has('gallery')
</script>

<template>
  <ArtGallery v-if="gallery" />
  <div v-else class="screen">
    <HomeScreen v-if="screen === 'home'" @play="screen = 'level'" @daily="screen = 'daily'" />
    <GameScreen v-else :mode="screen" @back="screen = 'home'" />
  </div>
</template>
