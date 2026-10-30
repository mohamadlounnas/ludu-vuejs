<script setup lang="ts">
import { useId } from 'vue'

/**
 * Golden fish cracker used as a life: embossed scales, a glossy top and a
 * baked rim. When `lost` it becomes a pale outline; if the root also has
 * the `gone` class (set by the game when a fish is lost) the golden cracker
 * snaps in two and the halves tumble away.
 */
defineProps<{ lost?: boolean }>()
const id = useId()
const BODY =
  'M6 40 C8 10 48 4 64 30 L80 15 C87 10 94 15 91 23 L85 40 L91 57 C94 65 87 70 80 65 L64 50 C48 76 8 70 6 40 Z'
</script>

<template>
  <svg viewBox="0 0 100 100" aria-hidden="true" class="fish-icon" :class="{ lost }">
    <defs>
      <linearGradient :id="`${id}-gold`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffdb6e" />
        <stop offset="0.55" stop-color="#f7b52c" />
        <stop offset="1" stop-color="#e48f12" />
      </linearGradient>
      <linearGradient :id="`${id}-pale`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fffdfb" />
        <stop offset="1" stop-color="#f3ebe4" />
      </linearGradient>
      <clipPath :id="`${id}-front`"><rect x="0" y="0" width="47" height="100" /></clipPath>
      <clipPath :id="`${id}-back`"><rect x="47" y="0" width="53" height="100" /></clipPath>
    </defs>

    <g transform="translate(0 10) rotate(32 50 40)">
      <!-- pale outline left behind by a lost fish -->
      <g v-if="lost">
        <path :d="BODY" :fill="`url(#${id}-pale)`" stroke="#eadfd5" stroke-width="3" stroke-linejoin="round" />
        <circle cx="22" cy="35" r="4.5" fill="#e6dad0" />
      </g>

      <!-- the golden cracker (whole, or as two shards when lost) -->
      <g v-for="part in lost ? ['front', 'back'] : ['whole']" :key="part" :class="['cracker', part]" :clip-path="part === 'whole' ? undefined : `url(#${id}-${part})`">
        <path :d="BODY" :fill="`url(#${id}-gold)`" stroke="#d98a10" stroke-width="3" stroke-linejoin="round" />
        <!-- embossed scales -->
        <g fill="none" stroke="#e39a1c" stroke-width="2.4" stroke-linecap="round" opacity="0.8">
          <path d="M38 26 Q44 34 38 42 M48 24 Q54 33 48 42 M40 46 Q46 52 42 58" />
        </g>
        <path d="M34 50 Q42 62 52 52" stroke="#d98a10" stroke-width="3" fill="none" stroke-linecap="round" />
        <circle cx="22" cy="35" r="4.8" fill="#6b4214" />
        <circle cx="23.6" cy="33.4" r="1.5" fill="#fff" />
        <!-- glossy top -->
        <path d="M14 30 Q24 14 44 16" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.55" />
      </g>
    </g>
  </svg>
</template>

<style scoped>
.fish-icon {
  overflow: visible;
}

/* Shards only exist for lost fish; they stay hidden unless the loss is fresh. */
.lost .cracker {
  opacity: 0;
}

.gone .cracker {
  transform-box: fill-box;
  transform-origin: 50% 50%;
}

.gone .cracker.front {
  animation: shard-front 0.85s forwards;
}

.gone .cracker.back {
  animation: shard-back 0.85s forwards;
}

/* A short crack (shake), then each half drops with gravity and spins away. */
@keyframes shard-front {
  0% {
    opacity: 1;
    transform: none;
  }
  18% {
    opacity: 1;
    transform: translate(-1px, 0) rotate(-4deg);
    animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45);
  }
  100% {
    opacity: 0;
    transform: translate(-14px, 46px) rotate(-70deg);
  }
}

@keyframes shard-back {
  0% {
    opacity: 1;
    transform: none;
  }
  18% {
    opacity: 1;
    transform: translate(2px, -1px) rotate(5deg);
    animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45);
  }
  100% {
    opacity: 0;
    transform: translate(16px, 40px) rotate(80deg);
  }
}
</style>
