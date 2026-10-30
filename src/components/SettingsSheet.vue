<script setup lang="ts">
import { defaultProgress, progress, type Lang } from '../game/progress'
import { t } from '../i18n'
import ModalCard from './ModalCard.vue'

const emit = defineEmits<{ close: []; reset: [] }>()

const LANGS: { id: Lang; name: string }[] = [
  { id: 'ar', name: 'العربية' },
  { id: 'en', name: 'English' },
]

const reset = () => {
  Object.assign(progress, { ...defaultProgress(), lang: progress.lang, settings: { ...progress.settings } })
  emit('reset')
}
</script>

<template>
  <ModalCard>
    <h2>{{ t('settings') }}</h2>
    <p class="label">{{ t('language') }}</p>
    <div class="langs">
      <button
        v-for="lang in LANGS"
        :key="lang.id"
        class="pill"
        :class="{ active: progress.lang === lang.id }"
        @click="progress.lang = lang.id"
      >
        {{ lang.name }}
      </button>
    </div>
    <div class="toggles">
      <label class="toggle">
        <input v-model="progress.settings.sound" type="checkbox" />
        <span class="knob" aria-hidden="true" />
        {{ t('sound') }}
      </label>
      <label class="toggle">
        <input v-model="progress.settings.vibrate" type="checkbox" />
        <span class="knob" aria-hidden="true" />
        {{ t('vibrate') }}
      </label>
    </div>
    <button class="pill" @click="reset">{{ t('reset') }}</button>
    <button class="pill primary" @click="emit('close')">{{ t('close') }}</button>
  </ModalCard>
</template>

<style scoped>
h2 {
  margin: 0;
  font-size: 6cqw;
}

.label {
  margin: 0;
  font-size: 4cqw;
}

.langs {
  display: flex;
  gap: 2cqw;
}

.toggles {
  display: flex;
  flex-direction: column;
  gap: 2cqw;
  align-self: stretch;
  padding: 0 4cqw;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 3cqw;
  font-size: 4.4cqw;
  font-weight: 600;
  cursor: pointer;
}

.toggle input {
  position: absolute;
  opacity: 0;
}

.knob {
  position: relative;
  flex: none;
  width: 11cqw;
  height: 6.4cqw;
  border-radius: 999px;
  background: #dccfc6;
  transition: background 0.2s;
}

.knob::after {
  content: '';
  position: absolute;
  top: 0.7cqw;
  left: 0.7cqw;
  width: 5cqw;
  height: 5cqw;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0.3cqw 0.8cqw rgb(0 0 0 / 0.2);
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

input:checked + .knob {
  background: #6cc070;
}

input:checked + .knob::after {
  transform: translateX(4.6cqw);
}

input:focus-visible + .knob {
  outline: 0.6cqw solid var(--text);
}

.active {
  background: var(--text);
  color: #fff;
}
</style>
