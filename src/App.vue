<script setup lang="ts">
import { ref } from 'vue'
import GameScreen from './components/GameScreen.vue'
import HomeScreen from './components/HomeScreen.vue'

const screen = ref<'home' | 'level' | 'daily'>('home')
</script>

<template>
  <div class="screen">
    <HomeScreen v-if="screen === 'home'" @play="screen = 'level'" @daily="screen = 'daily'" />
    <GameScreen v-else :mode="screen" @back="screen = 'home'" />
  </div>
</template>
