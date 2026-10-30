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
  Object.assign(progress, { ...defaultProgress(), lang: progress.lang })
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

.active {
  background: var(--text);
  color: #fff;
}
</style>
