<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Placement } from '../game/useGame'
import CatFace from './icons/CatFace.vue'

/**
 * Things that fly across the screen, over everything: a real cat's points
 * sparkle up to the Points counter (`target`), and a copy of the cat flies
 * up to its head on the region strip (`[data-region]`). Positions are
 * measured on every placement, so they follow any layout. Calm mode skips it.
 */
const props = defineProps<{ placement: Placement | null; regions: number[]; target: HTMLElement | null; calm?: boolean }>()

/** Stars leave this far apart, and each flies this long (GameScreen counts the points as the first lands). */
const STAR_STEP_MS = 35
const STAR_MS = 520
const STARS = 6
/** The cat lands on its head just before this (RegionStrip pops it at 440ms). */
const TOKEN_MS = 460

interface Sprite {
  id: number
  kind: 'star' | 'token'
  x: number
  y: number
  dx: number
  dy: number
  delay: number
  size: number
}

const layer = ref<HTMLElement | null>(null)
const sprites = ref<Sprite[]>([])
let nextId = 0

const centre = (el: Element) => {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

watch(
  () => props.placement,
  (p) => {
    const box = layer.value?.getBoundingClientRect()
    const cell = document.querySelector(`[data-cell="${p?.cell}"]`)
    if (!p || p.kind !== 'cat' || props.calm || !box || !cell) return
    // Relative to the layer, wherever its containing block is.
    const from = centre(cell)
    const x = from.x - box.left
    const y = from.y - box.top
    const fly = (to: { x: number; y: number }) => ({ x, y, dx: to.x - from.x, dy: to.y - from.y })
    const add: Sprite[] = []
    if (p.points > 0 && props.target) {
      const path = fly(centre(props.target))
      for (let i = 0; i < STARS; i++) {
        add.push({ id: nextId++, kind: 'star', ...path, delay: i * STAR_STEP_MS, size: 1 - i * 0.09 })
      }
    }
    const head = document.querySelector(`[data-region="${props.regions[p.cell]}"]`)
    if (head) add.push({ id: nextId++, kind: 'token', ...fly(centre(head)), delay: 0, size: 1 })
    sprites.value = [...sprites.value, ...add]
  },
)

/** Each sprite goes as soon as its flight ends. */
const drop = (id: number) => (sprites.value = sprites.value.filter((s) => s.id !== id))

const spriteStyle = (s: Sprite) => ({
  left: `${s.x}px`,
  top: `${s.y}px`,
  '--dx': `${s.dx}px`,
  '--dy': `${s.dy}px`,
  '--s': s.size,
  animationDelay: `${s.delay}ms`,
})
</script>

<template>
  <div ref="layer" class="fx-layer" dir="ltr" aria-hidden="true">
    <i
      v-for="s in sprites"
      :key="s.id"
      class="sprite"
      :class="s.kind"
      :style="[spriteStyle(s), { animationDuration: `${s.kind === 'star' ? STAR_MS : TOKEN_MS}ms` }]"
      @animationend.self="drop(s.id)"
    >
      <i class="arc">
        <svg v-if="s.kind === 'star'" class="spark" viewBox="0 0 24 24">
          <path d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z" />
          <circle cx="12" cy="12" r="2.6" />
        </svg>
        <CatFace v-else class="cat" still />
      </i>
    </i>
  </div>
</template>

<style scoped>
.fx-layer {
  position: fixed;
  z-index: 9;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.sprite,
.arc {
  position: absolute;
  display: block;
  animation-fill-mode: both;
}

/* Every layer of a sprite runs on its sprite's clock. */
.arc,
.spark,
.cat {
  animation-delay: inherit;
  animation-duration: inherit;
  animation-fill-mode: both;
}

/*
 * A star: straight across at a steady pace, while it shoots up fast,
 * overshoots the counter a little and drops into it (y = cubic-bezier).
 */
.star {
  animation-name: across;
  animation-timing-function: linear;
}

.star .arc {
  animation-name: up;
  animation-timing-function: cubic-bezier(0.3, 1.3, 0.6, 1.12);
}

.spark {
  display: block;
  width: calc(3cqw * var(--s));
  margin: calc(-1.5cqw * var(--s));
  overflow: visible;
  fill: #ffd23f;
  filter: drop-shadow(0 0 0.6cqw rgb(255 190 40 / 0.8));
  animation-name: twinkle;
  animation-timing-function: linear;
}

.spark circle {
  fill: #fff;
}

@keyframes across {
  to {
    transform: translateX(var(--dx));
  }
}

@keyframes up {
  to {
    transform: translateY(var(--dy));
  }
}

/* Pops out of the cell, spins half a turn on the way and shrinks into the counter. */
@keyframes twinkle {
  0% {
    transform: scale(0) rotate(0);
    opacity: 0;
  }
  10% {
    transform: scale(1.15) rotate(18deg);
    opacity: 1;
  }
  20% {
    transform: scale(1) rotate(36deg);
  }
  92% {
    opacity: 1;
  }
  100% {
    transform: scale(0.5) rotate(180deg);
    opacity: 0;
  }
}

/*
 * The cat: eased all the way (it leaves gently and settles onto its head),
 * lifted on an arc on top, stretched while it rises and squashed as it lands.
 */
.token {
  animation-name: hop-to;
  animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}

.token .arc {
  animation-name: lift;
}

.cat {
  display: block;
  width: 5.6cqw;
  margin: -3cqw 0 0 -2.8cqw;
  transform-origin: 50% 90%;
  animation-name: stretch;
}

@keyframes hop-to {
  to {
    transform: translate(var(--dx), var(--dy));
  }
}

/* Up, slowing at the top of the arc, then falling onto the head under gravity. */
@keyframes lift {
  0% {
    transform: none;
    animation-timing-function: cubic-bezier(0.33, 0.6, 0.6, 1);
  }
  62% {
    transform: translateY(-7cqw);
    animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45);
  }
  100% {
    transform: none;
  }
}

@keyframes stretch {
  0% {
    transform: scale(0.7);
    opacity: 0;
  }
  12% {
    transform: scale(0.9, 1.12);
    opacity: 1;
  }
  45% {
    transform: none;
  }
  85% {
    transform: scale(0.95, 1.07);
  }
  93% {
    opacity: 1;
  }
  100% {
    transform: scale(1.08, 0.9);
    opacity: 0;
  }
}
</style>
