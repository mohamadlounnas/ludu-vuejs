<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { dailyDone, progress } from '../game/progress'
import { t } from '../i18n'
import AppIcons from './icons/AppIcons.vue'
import CatFace from './icons/CatFace.vue'
import XMark from './icons/XMark.vue'
import YarnIcon from './icons/YarnIcon.vue'
import SettingsSheet from './SettingsSheet.vue'

defineEmits<{ play: []; daily: [] }>()
const showSettings = ref(false)

// Countdown to the next daily puzzle (they change at UTC midnight).
const now = ref(Date.now())
const timer = window.setInterval(() => (now.value = Date.now()), 1000)
onBeforeUnmount(() => clearInterval(timer))

const countdown = computed(() => {
  const left = Math.max(0, 86_400_000 - (now.value % 86_400_000))
  const s = Math.floor(left / 1000)
  return [s / 3600, (s / 60) % 60, s % 60].map((n) => String(Math.floor(n)).padStart(2, '0')).join(':')
})
const doneToday = computed(() => (now.value, dailyDone()))
</script>

<template>
  <div class="home">
    <XMark class="ghost-x one" :animate="false" />
    <XMark class="ghost-x two" :animate="false" />
    <XMark class="ghost-x three" :animate="false" />

    <div class="top" dir="ltr">
      <div class="avatar"><CatFace /></div>
      <div class="streak" :title="t('streak')">
        <YarnIcon />
        <span>{{ progress.daily.streak }}</span>
      </div>
      <button class="round" :aria-label="t('settings')" @click="showSettings = true">
        <AppIcons name="gear" />
      </button>
    </div>

    <h1 class="logo" dir="ltr" :aria-label="t('title')">
      <span class="line">C<span class="ear-a">A</span>T</span>
      <span class="line">GR<span class="tail-i">I</span>D</span>
    </h1>

    <div class="actions">
      <button class="cta level" @click="$emit('play')">{{ t('level') }} {{ progress.level }}</button>
      <button class="cta daily" @click="$emit('daily')">
        <span v-if="doneToday">✓ </span>{{ t('daily') }}
      </button>
      <span class="timer" dir="ltr">⏱ {{ countdown }}</span>
    </div>

    <SettingsSheet v-if="showSettings" @close="showSettings = false" @reset="showSettings = false" />
  </div>
</template>

<style scoped>
.home {
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: calc(4cqw + env(safe-area-inset-top)) 3.2cqw 12cqw;
  overflow: hidden;
  /* Faint tiled board in the background, like the original home screen. */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect x='3' y='3' width='94' height='94' rx='12' fill='none' stroke='%23ece1d9' stroke-width='2.5'/%3E%3C/svg%3E");
  background-size: 17cqw 17cqw;
  background-position: -2cqw -4cqw;
}

.ghost-x {
  position: absolute;
  width: 15cqw;
  color: #ebe0d8;
}

.one {
  top: 0;
  left: 20cqw;
}

.two {
  top: 46cqw;
  right: -5cqw;
}

.three {
  top: 80cqw;
  right: 4cqw;
  width: 11cqw;
}

.top {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.avatar {
  width: 14.5cqw;
  height: 14.5cqw;
  box-sizing: border-box;
  border: 1cqw solid #f6c344;
  border-radius: 2.4cqw;
  background: linear-gradient(#ffe7a3, #ffd36b);
  display: grid;
  place-items: center;
  box-shadow: var(--shadow);
}

.avatar svg {
  width: 85%;
  margin-top: 10%;
}

.streak {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1.5cqw;
  width: 28cqw;
  height: 9.5cqw;
  border-radius: 4.75cqw;
  background: var(--card);
  box-shadow: var(--shadow);
  font-size: 5.5cqw;
  font-weight: 700;
  color: #a0601c;
}

.streak svg {
  width: 7cqw;
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

.logo {
  position: relative;
  margin: 18cqw 0 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  font-family: system-ui, sans-serif;
  font-weight: 900;
  font-size: 19cqw;
  line-height: 0.92;
  letter-spacing: -0.5cqw;
  color: #7b4f36;
}

.ear-a {
  position: relative;
  color: #7f97f0;
}

/* Cat ears on the blue A. */
.ear-a::before,
.ear-a::after {
  content: '';
  position: absolute;
  top: -1.6cqw;
  width: 0;
  height: 0;
  border-left: 2.4cqw solid transparent;
  border-right: 2.4cqw solid transparent;
  border-bottom: 4.6cqw solid #7f97f0;
}

.ear-a::before {
  left: 0.6cqw;
  transform: rotate(-18deg);
}

.ear-a::after {
  right: 0.6cqw;
  transform: rotate(18deg);
}

.tail-i {
  position: relative;
  color: #f28a1e;
}

/* Striped tail curling under the orange I. */
.tail-i::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 88%;
  width: 7cqw;
  height: 7cqw;
  border: 1.6cqw solid transparent;
  border-bottom-color: #7b4f36;
  border-left-color: #7b4f36;
  border-radius: 50%;
  transform: translateX(-30%) rotate(-20deg);
}

.actions {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5cqw;
}

.cta {
  width: 69cqw;
  height: 14.7cqw;
  border: none;
  border-radius: 999px;
  color: #fff;
  font-size: 7cqw;
  line-height: 1;
}

.level {
  background: #f28a1e;
  font-weight: 700;
  box-shadow: 0 1.2cqw 3cqw rgb(242 138 30 / 0.35);
}

.daily {
  background: #8a9ef0;
  font-weight: 500;
  box-shadow: 0 1.2cqw 3cqw rgb(138 158 240 / 0.35);
}

.timer {
  margin-top: -5cqw;
  padding: 0.6cqw 2.4cqw;
  border-radius: 0 0 1.6cqw 1.6cqw;
  background: #8193e6;
  color: #fff;
  font-size: 3.6cqw;
  font-weight: 700;
}

.cta:active {
  transform: scale(0.96);
}
</style>
