<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { INKS } from '../game/palette'
import { DOUBLE_TAP_MS } from '../game/useGame'
import { t } from '../i18n'
import XMark from './icons/XMark.vue'

/**
 * Marking toolbar: the white pen and the test inks, a middle slot that says
 * what the focus ink can do next (Keep, Cross out) or what went wrong, then
 * undo and "erase this colour". An ink that broke shows a red '!'.
 */
const props = defineProps<{
  active: number
  /** The test ink the board shows in full. */
  focus: number
  /** Marks per layer. */
  use: number[]
  /** Broken inks; 0 is the pen (a group with no room left). */
  broken: Set<number>
  /** The focus ink's guess can be crossed out. */
  refutable: boolean
  canUndo: boolean
  /** A contradiction is about to show on the board: keep the message as it is until then. */
  hold: boolean
  /** Bumped when the pen overrules a test cat of `ink`: its chip says no. */
  nope: { id: number; ink: number } | null
}>()
const emit = defineEmits<{ pick: [ink: number]; undo: []; erase: [ink: number]; keep: [ink: number]; crossOut: [ink: number] }>()

type Slot = 'noRoom' | 'idle' | 'keep' | 'crossOut' | 'impossible'

/** One message at a time, most urgent first. */
const next = computed<Slot | null>(() => {
  if (props.broken.has(0)) return 'noRoom'
  if (props.active > 0 && props.use[props.active] === 0) return 'idle'
  const k = props.focus
  if (k === 0 || props.use[k] === 0) return null
  if (!props.broken.has(k)) return 'keep'
  return props.refutable ? 'crossOut' : 'impossible'
})

const slot = ref(next.value)
let keepTimer = 0
watch([next, () => props.hold], () => {
  clearTimeout(keepTimer)
  // A contradiction is on its way: a "Keep" from just before it must not linger.
  if (props.hold) {
    if (slot.value === 'keep') slot.value = null
    return
  }
  // "Keep" waits out a double-tap: the first tap's X may be the start of a test cat that fails.
  if (next.value === 'keep' && slot.value !== 'keep') keepTimer = window.setTimeout(() => (slot.value = next.value), DOUBLE_TAP_MS)
  else slot.value = next.value
})
onBeforeUnmount(() => clearTimeout(keepTimer))

const LABELS = { noRoom: 'noRoom', idle: 'inkIdle', keep: 'inkKeep', crossOut: 'inkCrossOut', impossible: 'contradictionShort' } as const

const onSlot = () => {
  if (slot.value === 'keep') emit('keep', props.focus)
  else if (slot.value === 'crossOut') emit('crossOut', props.focus)
}

// Restart the head-shake on every "nope" by alternating two identical animations.
const shake = ref<{ ink: number; n: number } | null>(null)
watch(
  () => props.nope,
  (nope) => nope && (shake.value = { ink: nope.ink, n: (shake.value?.n ?? 0) + 1 }),
)
</script>

<template>
  <div class="ink-bar" dir="ltr">
    <div class="inks" role="radiogroup" :aria-label="t('inks')">
      <button
        v-for="(ink, i) in INKS"
        :key="i"
        class="ink swatch"
        :class="{
          active: active === i,
          focus: active === 0 && focus === i && i > 0,
          [`nope${(shake?.n ?? 0) % 2}`]: shake?.ink === i,
        }"
        role="radio"
        :aria-checked="active === i"
        :aria-label="i === 0 ? t('inkPen') : `${t('inkTest')} ${i}`"
        @click="$emit('pick', i)"
      >
        <XMark :animate="false" :halo="ink.halo || '#c9b8ad'" :style="{ color: ink.color }" />
        <Transition name="badge">
          <span v-if="use[i] > 0" :key="use[i]" class="count" dir="auto">{{ use[i] }}</span>
        </Transition>
        <Transition name="badge">
          <span v-if="broken.has(i)" class="bang" dir="auto">!</span>
        </Transition>
      </button>
    </div>
    <div class="slot">
      <Transition name="slot" mode="out-in" type="transition">
        <button v-if="slot === 'keep' || slot === 'crossOut'" :key="slot" class="act" :class="slot" dir="auto" @click="onSlot">
          {{ t(LABELS[slot]) }}
        </button>
        <p v-else-if="slot" :key="slot" class="msg" :class="slot" role="status" dir="auto">{{ t(LABELS[slot]) }}</p>
      </Transition>
    </div>
    <div class="actions">
      <button
        class="tool undo"
        :class="{ urge: slot === 'noRoom' && canUndo }"
        :disabled="!canUndo"
        :aria-label="t('undo')"
        :title="t('undo')"
        @click="$emit('undo')"
      >
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M18 12 L8 22 L18 32 M9 22 H30 A10 10 0 0 1 30 42 H22" />
        </svg>
      </button>
      <button
        class="tool"
        :disabled="active === 0 || use[active] === 0"
        :aria-label="t('eraseInk')"
        :title="t('eraseInk')"
        @click="$emit('erase', active)"
      >
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M14 34 L30 10 L42 18 L28 40 H16 Z M22 24 L34 32 M10 40 H40" />
        </svg>
        <i v-if="active > 0" class="dot" :style="{ background: INKS[active].color }" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.ink-bar {
  display: flex;
  align-items: center;
  margin: 0 3.2cqw;
  padding: 1.3cqw;
  background: var(--card);
  border-radius: 999px;
  box-shadow: var(--shadow);
}

.inks,
.actions {
  flex: none;
  display: flex;
  gap: 1.4cqw;
}

.inks button,
.actions button {
  position: relative;
  width: 10cqw;
  height: 10cqw;
  border: none;
  border-radius: 50%;
  padding: 0;
  display: grid;
  place-items: center;
  transition:
    transform 0.4s cubic-bezier(0.34, 1.9, 0.64, 1),
    background 0.15s,
    box-shadow 0.25s;
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

/* With the pen in hand, a faint ring shows which test layer the board still shows. */
.ink.focus {
  box-shadow: 0 0 0 0.7cqw var(--card), 0 0 0 1.1cqw rgb(139 87 83 / 0.35);
}

.nope0 {
  animation: nope-a 0.5s ease-in-out 2;
}

.nope1 {
  animation: nope-b 0.5s ease-in-out 2;
}

.count,
.bang {
  position: absolute;
  border-radius: 999px;
  color: #fff;
  font-weight: 800;
  text-align: center;
}

.count {
  bottom: -1cqw;
  right: -0.8cqw;
  min-width: 4cqw;
  padding: 0 0.6cqw;
  background: var(--text);
  font-size: 2.6cqw;
  line-height: 4cqw;
}

.bang {
  top: -1cqw;
  right: -1cqw;
  width: 4.4cqw;
  height: 4.4cqw;
  background: var(--danger);
  font-size: 3.2cqw;
  line-height: 4.4cqw;
}

.badge-enter-active {
  transition: transform 0.3s cubic-bezier(0.34, 1.9, 0.64, 1);
}

.badge-enter-from {
  transform: scale(0.3);
}

.badge-leave-active {
  position: absolute;
  transition:
    transform 0.12s ease-in,
    opacity 0.12s ease-in;
}

.badge-leave-to {
  transform: scale(0.3);
  opacity: 0;
}

/* Middle slot: one state at a time. */
.slot {
  flex: 1;
  min-width: 0;
  display: flex;
  justify-content: center;
  margin: 0 1cqw;
}

.act,
.msg {
  max-width: 100%;
  margin: 0;
  /* Snug, so the longest label ("No room left!") still fits a 360px phone. */
  padding: 1.6cqw 2cqw;
  border: none;
  border-radius: 999px;
  font-size: 3.1cqw;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.act {
  color: #fff;
  transition: transform 0.4s cubic-bezier(0.34, 1.9, 0.64, 1);
}

.act:active {
  transform: scale(0.9);
  transition-duration: 0.08s;
}

.act.keep {
  background: #3faba9;
  box-shadow: 0 0.6cqw 0 #2b8583;
}

/* Cross out: the way forward after a broken guess, so it asks to be tapped. */
.act.crossOut {
  background: #e8323a;
  box-shadow: 0 0.6cqw 0 #b31f26;
  /* Starts once its entrance has played. */
  animation: ask 0.9s ease-in-out 0.3s infinite;
}

.msg.noRoom,
.msg.impossible {
  background: #e8323a;
  color: #fff;
}

/* A hint, not an alert: muted, and allowed a second line rather than losing its end. */
.msg.idle {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  padding: 0 0.6cqw;
  white-space: normal;
  text-align: center;
  line-height: 1.15;
  color: var(--text);
  opacity: 0.7;
  font-weight: 600;
}

.slot-enter-active {
  transition:
    opacity 0.18s,
    transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.slot-leave-active {
  transition:
    opacity 0.12s ease-in,
    transform 0.12s ease-in;
}

.slot-enter-from,
.slot-leave-to {
  opacity: 0;
  transform: scale(0.7);
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

/* No room left on the pen: undo is the way out. */
.tool.urge {
  animation: urge 0.6s ease-in-out 3;
}

.tool:active:not(:disabled),
.ink:active {
  transform: scale(0.86);
  transition-duration: 0.08s;
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

@keyframes ask {
  50% {
    transform: scale(1.05);
  }
}

@keyframes urge {
  50% {
    transform: scale(1.12);
  }
}

@keyframes nope-a {
  25% {
    rotate: -12deg;
  }
  75% {
    rotate: 12deg;
  }
}

@keyframes nope-b {
  25% {
    rotate: -12deg;
  }
  75% {
    rotate: 12deg;
  }
}
</style>
