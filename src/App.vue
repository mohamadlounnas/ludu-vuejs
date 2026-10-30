<script setup lang="ts">
import { ref } from 'vue'
import GameScreen from './components/GameScreen.vue'
import HomeScreen from './components/HomeScreen.vue'

const screen = ref<'home' | 'game'>('home')
</script>

<template>
  <div class="screen">
    <HomeScreen v-if="screen === 'home'" @play="screen = 'game'" />
    <GameScreen v-else @back="screen = 'home'" />
  </div>
</template>
