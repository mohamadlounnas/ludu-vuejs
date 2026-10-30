<script setup lang="ts">
import { ref } from 'vue'
import { defaultProgress, progress, type Lang } from '../game/progress'
import { t } from '../i18n'
import ModalCard from './ModalCard.vue'

const emit = defineEmits<{ close: []; reset: [] }>()

const LANGS: { id: Lang; name: string }[] = [
  { id: 'ar', name: 'العربية' },
  { id: 'en', name: 'English' },
]

/** Brings the coach back: every tutorial plays again. */
const howToPlay = () => {
  progress.tips = { basics: false, inks: false }
  emit('close')
}

/** Reset is two steps: a small link opens a question, and only "Yes" wipes progress. */
const confirming = ref(false)
const reset = () => {
  Object.assign(progress, { ...defaultProgress(), lang: progress.lang, settings: { ...progress.settings } })
  confirming.value = false
  emit('reset')
}
</script>

<template>
  <ModalCard dismissible :label="t('settings')" @dismiss="emit('close')">
    <button class="x" :aria-label="t('close')" @click="emit('close')">✕</button>
    <h2>{{ t('settings') }}</h2>
    <p class="label">{{ t('language') }}</p>
    <!-- The two languages keep their places whichever is chosen. -->
    <div class="langs" dir="ltr">
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
        <input v-model="progress.settings.music" type="checkbox" />
        <span class="knob" aria-hidden="true" />
        {{ t('music') }}
      </label>
      <label class="toggle">
        <input v-model="progress.settings.vibrate" type="checkbox" />
        <span class="knob" aria-hidden="true" />
        {{ t('vibrate') }}
      </label>
      <label class="toggle">
        <input v-model="progress.settings.calm" type="checkbox" />
        <span class="knob" aria-hidden="true" />
        {{ t('calm') }}
      </label>
      <label class="toggle">
        <input v-model="progress.settings.patterns" type="checkbox" />
        <span class="knob" aria-hidden="true" />
        {{ t('patterns') }}
      </label>
    </div>
    <button class="pill" @click="howToPlay">{{ t('howToPlay') }}</button>
    <button class="pill primary" @click="emit('close')">{{ t('close') }}</button>
    <div class="danger-zone">
      <button v-if="!confirming" class="danger-link" @click="confirming = true">{{ t('reset') }}</button>
      <div v-else class="confirm" role="alertdialog" :aria-label="t('reset')">
        <p>{{ t('resetAsk') }}</p>
        <div class="confirm-actions">
          <button class="pill danger" @click="reset">{{ t('resetYes') }}</button>
          <button class="pill" @click="confirming = false">{{ t('cancel') }}</button>
        </div>
      </div>
    </div>
  </ModalCard>
</template>

<style scoped>
/* Reset lives apart from everything else, as a quiet red link behind a divider. */
.danger-zone {
  align-self: stretch;
  display: flex;
  justify-content: center;
  margin-top: 2cqw;
  padding-top: 3cqw;
  border-top: 0.3cqw solid var(--tile);
}

.danger-link {
  border: none;
  background: none;
  padding: 1.5cqw 3cqw;
  color: #c93a35;
  font-size: 3.8cqw;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 0.6cqw;
}

.confirm {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2.4cqw;
  text-align: center;
}

.confirm p {
  margin: 0;
  font-size: 3.8cqw;
  line-height: 1.35;
}

.confirm-actions {
  display: flex;
  gap: 2.4cqw;
}

.pill.danger {
  background: #e5484d;
  color: #fff;
}

/* On short screens the sheet scrolls rather than running off the edge. */
:deep(.card) {
  max-height: 85dvh;
  overflow-y: auto;
  overscroll-behavior: contain;
}

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

/* Right to left, a switch turns on towards the left. */
:dir(rtl) .knob::after {
  left: auto;
  right: 0.7cqw;
}

:dir(rtl) input:checked + .knob::after {
  transform: translateX(-4.6cqw);
}

.x {
  position: absolute;
  top: 3cqw;
  inset-inline-end: 3cqw;
  width: 9cqw;
  height: 9cqw;
  border: none;
  border-radius: 50%;
  background: var(--tile);
  color: var(--text);
  font-size: 4cqw;
  line-height: 1;
}

input:focus-visible + .knob {
  outline: 0.6cqw solid var(--text);
}

.active {
  background: var(--text);
  color: #fff;
}
</style>
