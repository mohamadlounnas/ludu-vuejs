<script setup lang="ts">
import { INKS } from '../game/palette'
import { t } from '../i18n'
import XMark from './icons/XMark.vue'

/**
 * Marking toolbar: the white pen plus test inks for "what if" reasoning,
 * with undo and "erase this colour". An ink whose marks lead to a
 * contradiction shakes and shows a red dot.
 */
defineProps<{
  active: number
  use: number[]
  broken: Set<number>
  canUndo: boolean
  /** Short contradiction message shown between the inks and the tools. */
  warning: string
}>()
defineEmits<{ pick: [ink: number]; undo: []; erase: [ink: number] }>()
</script>

<template>
  <div class="ink-bar" dir="ltr">
    <div class="inks" role="radiogroup" :aria-label="t('inks')">
      <button
        v-for="(ink, i) in INKS"
        :key="i"
        class="ink swatch"
        :class="{ active: active === i, broken: broken.has(i) }"
        role="radio"
        :aria-checked="active === i"
        :aria-label="i === 0 ? t('inkPen') : `${t('inkTest')} ${i}`"
        @click="$emit('pick', i)"
      >
        <XMark :animate="false" :halo="ink.halo || '#c9b8ad'" :style="{ color: ink.color }" />
        <span v-if="use[i] > 0 && i > 0" class="count">{{ use[i] }}</span>
      </button>
    </div>
    <Transition name="warn">
      <p v-if="warning" class="warning" role="status">{{ warning }}</p>
    </Transition>
    <div class="actions">
      <button class="tool" :disabled="!canUndo" :aria-label="t('undo')" :title="t('undo')" @click="$emit('undo')">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M18 12 L8 22 L18 32 M9 22 H30 A10 10 0 0 1 30 42 H22" />
        </svg>
      </button>
      <button
        class="tool"
        :disabled="use[active] === 0"
        :aria-label="t('eraseInk')"
        :title="t('eraseInk')"
        @click="$emit('erase', active)"
      >
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M14 34 L30 10 L42 18 L28 40 H16 Z M22 24 L34 32 M10 40 H40" />
        </svg>
        <i class="dot" :style="{ background: INKS[active].color }" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.ink-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 3.2cqw;
  padding: 1.3cqw;
  background: var(--card);
  border-radius: 999px;
  box-shadow: var(--shadow);
}

.inks,
.actions {
  display: flex;
  gap: 1.4cqw;
}

button {
  position: relative;
  width: 10cqw;
  height: 10cqw;
  border: none;
  border-radius: 50%;
  padding: 0;
  display: grid;
  place-items: center;
  transition: transform 0.15s, background 0.15s;
}

.ink {
  background: var(--tile);
}

.ink svg {
  width: 9cqw;
}

/* The pen draws white X's; show it on the cell colour players know. */
.ink:first-child {
  background: #cf6767;
}

.ink.active {
  transform: translateY(-0.8cqw) scale(1.08);
  box-shadow: 0 0 0 0.7cqw var(--card), 0 0 0 1.3cqw var(--text);
}

.ink.broken {
  animation: nope 0.5s ease-in-out 2;
}

.ink.broken::after {
  content: '!';
  position: absolute;
  top: -1cqw;
  right: -1cqw;
  width: 4.4cqw;
  height: 4.4cqw;
  border-radius: 50%;
  background: var(--danger);
  color: #fff;
  font-size: 3.2cqw;
  font-weight: 800;
  line-height: 4.4cqw;
}

.count {
  position: absolute;
  bottom: -1cqw;
  right: -0.8cqw;
  min-width: 4cqw;
  padding: 0 0.6cqw;
  border-radius: 2cqw;
  background: var(--text);
  color: #fff;
  font-size: 2.6cqw;
  line-height: 4cqw;
}

.tool {
  background: var(--tile);
  color: var(--text);
}

.tool svg {
  width: 6cqw;
  fill: none;
  stroke: currentColor;
  stroke-width: 4.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.tool:disabled {
  opacity: 0.4;
}

.tool:active:not(:disabled),
.ink:active {
  transform: scale(0.9);
}

.dot {
  position: absolute;
  bottom: 1.4cqw;
  right: 1.4cqw;
  width: 2.6cqw;
  height: 2.6cqw;
  border-radius: 50%;
  box-shadow: 0 0 0 0.4cqw var(--card), 0 0 0 0.6cqw #c9b8ad;
}

.warning {
  flex: 1;
  margin: 0 1cqw;
  padding: 0.8cqw 0;
  border-radius: 999px;
  background: #ec4b33;
  color: #fff;
  font-size: 3.3cqw;
  font-weight: 700;
  text-align: center;
  white-space: nowrap;
}

.warn-enter-active,
.warn-leave-active {
  transition: opacity 0.2s, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.warn-enter-from,
.warn-leave-to {
  opacity: 0;
  transform: scale(0.6);
}

@keyframes nope {
  25% {
    transform: rotate(-12deg);
  }
  75% {
    transform: rotate(12deg);
  }
}
</style>
