<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { currentStreak, dailyDone, progress } from '../game/progress'
import { haptic, sfx } from '../game/sfx'
import { t } from '../i18n'
import AppIcons from './icons/AppIcons.vue'
import CatFace from './icons/CatFace.vue'
import LogoMark from './icons/LogoMark.vue'
import SitCat from './icons/SitCat.vue'
import AmbientBackground from './AmbientBackground.vue'
import YarnIcon from './icons/YarnIcon.vue'
import SettingsSheet from './SettingsSheet.vue'

defineEmits<{ play: []; daily: [] }>()
const showSettings = ref(false)

/** A play button is usually the first tap, the one browsers let start sound: wake it, then tick. */
const tick = () => {
  sfx.unlock()
  sfx.ui()
}

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
const streak = computed(() => currentStreak(new Date(now.value)))

// ---- The mascot: watches the finger anywhere on the screen, and loves a pat ----

const mascot = ref<HTMLElement | null>(null)
const look = ref({ x: 0, y: 0 })
let lookTimer = 0
const watchPointer = (e: PointerEvent) => {
  const box = mascot.value?.getBoundingClientRect()
  if (!box) return
  // From the cat's eyes, roughly a third of the way down its box.
  const dx = e.clientX - (box.left + box.width / 2)
  const dy = e.clientY - (box.top + box.height * 0.32)
  const len = Math.max(1, Math.hypot(dx, dy))
  const reach = Math.min(1, len / 120)
  look.value = { x: (dx / len) * reach, y: (dy / len) * reach }
  clearTimeout(lookTimer)
  lookTimer = window.setTimeout(() => (look.value = { x: 0, y: 0 }), 2500)
}
onBeforeUnmount(() => clearTimeout(lookTimer))

const pets = ref(0)
let stopPurr: (() => void) | null = null
const petMascot = () => {
  pets.value++
  sfx.unlock()
  haptic(10)
  stopPurr?.()
  sfx.meow('happy')
  // A soft paw pat as it lands from its hop (SitCat's hop lands ~480ms in).
  sfx.pat(480)
  stopPurr = sfx.purr(1.6, 300)
}
</script>

<template>
  <div class="home" @pointermove="watchPointer" @pointerdown="watchPointer">
    <AmbientBackground variant="home" :calm="progress.settings.calm" />

    <div class="top" dir="ltr">
      <div class="avatar"><CatFace /></div>
      <div class="streak" :title="t('streak')">
        <YarnIcon />
        <span>{{ streak }}</span>
      </div>
      <button class="round" :aria-label="t('settings')" @click="showSettings = true">
        <AppIcons name="gear" />
      </button>
    </div>

    <h1 class="logo" dir="ltr" :aria-label="t('title')">
      <LogoMark />
    </h1>

    <button ref="mascot" class="mascot" :aria-label="t('petCat')" @click="petMascot">
      <SitCat :look="look" :pet="pets" :still="progress.settings.calm" />
      <span v-for="n in 3" :key="`${pets}-${n}`" class="pet-heart" :class="{ go: pets > 0 }" :style="{ '--n': n }">❤</span>
    </button>

    <div class="actions">
      <button class="cta level" @click="tick(), $emit('play')">{{ t('level') }} {{ progress.level }}</button>
      <button class="cta daily" @click="tick(), $emit('daily')">
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
  /* The ambient layer sits behind everything in here. */
  isolation: isolate;
  /* Faint tiled board in the background, like the original home screen. */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect x='3' y='3' width='94' height='94' rx='12' fill='none' stroke='%23ece1d9' stroke-width='2.5'/%3E%3C/svg%3E");
  background-size: 17cqw 17cqw;
  background-position: -2cqw -4cqw;
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
  margin: 10cqw 0 0;
  width: 62cqw;
}

/* The mascot: a real button (it can be patted), drawn as a cat on a cushion. */
.mascot {
  position: relative;
  margin-top: 2cqw;
  width: 46cqw;
  padding: 0;
  border: none;
  background: none;
  -webkit-tap-highlight-color: transparent;
}

.mascot svg {
  display: block;
  width: 100%;
}

.pet-heart {
  position: absolute;
  left: 50%;
  top: 18%;
  font-size: 6cqw;
  color: #ff6f9c;
  opacity: 0;
  pointer-events: none;
}

.pet-heart.go {
  animation: pet-heart 1.6s cubic-bezier(0.25, 0.55, 0.35, 1) both;
  animation-delay: calc((var(--n) - 1) * 0.18s);
}

@keyframes pet-heart {
  0% {
    transform: translate(-50%, 0) scale(0.2);
    opacity: 0;
  }
  15% {
    transform: translate(calc(-50% + (var(--n) - 2) * 3cqw), -3cqw) scale(1.1);
    opacity: 1;
  }
  100% {
    transform: translate(calc(-50% + (var(--n) - 2) * 9cqw), -24cqw) scale(0.8) rotate(calc((var(--n) - 2) * 18deg));
    opacity: 0;
  }
}

.actions {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5cqw;
}

/*
 * Candy buttons: a light top edge, a darker lip underneath that the button
 * presses down into, and a soft coloured glow.
 */
.cta {
  --lip: 1.3cqw;
  width: 69cqw;
  height: 14.7cqw;
  border: none;
  border-radius: 999px;
  color: #fff;
  font-size: 7cqw;
  line-height: 1;
  text-shadow: 0 0.3cqw 0 rgb(0 0 0 / 0.12);
  box-shadow:
    inset 0 0.9cqw 0 rgb(255 255 255 / 0.28),
    inset 0 calc(var(--lip) * -1) 0 var(--edge),
    0 1.6cqw 3.4cqw var(--glow);
  /* Springs back when released. */
  transition:
    transform 160ms cubic-bezier(0.34, 1.8, 0.64, 1),
    box-shadow 160ms ease-out;
}

.level {
  --edge: #cf6b0b;
  --glow: rgb(242 138 30 / 0.38);
  background: linear-gradient(#f9a04a, #f28a1e 55%);
  font-weight: 700;
}

.daily {
  --edge: #6d82db;
  --glow: rgb(138 158 240 / 0.38);
  background: linear-gradient(#a2b2f6, #8a9ef0 55%);
  font-weight: 500;
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
  --lip: 0.4cqw;
  transform: translateY(0.9cqw) scale(0.985);
  transition-duration: 60ms;
  transition-timing-function: ease-out;
}
</style>
