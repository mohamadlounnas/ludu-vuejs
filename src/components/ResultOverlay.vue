<script setup lang="ts">
/** Full-screen result card styled after the original "out of fish" screen. */
defineProps<{ title: string; tone: 'lost' | 'won' }>()
</script>

<template>
  <div class="overlay" role="dialog" aria-modal="true">
    <h2 :class="tone">{{ title }}</h2>
    <div class="art"><slot name="art" /></div>
    <slot />
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3cqw;
  padding: 6cqw 0 10cqw;
  background: rgb(28 30 38 / 0.86);
  animation: fade 0.35s ease-out;
}

h2 {
  margin: 0;
  font-size: 11cqw;
  font-weight: 800;
  line-height: 1.2;
  paint-order: stroke fill;
  -webkit-text-stroke: 1.6cqw #fff;
  animation: drop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s backwards;
}

h2.lost {
  color: #4a95e6;
  text-shadow: 0 0.9cqw 0 #2f68b8;
}

h2.won {
  color: #f28a1e;
  text-shadow: 0 0.9cqw 0 #c4600c;
}

.art {
  width: 52cqw;
  animation: rise 0.5s ease-out 0.2s backwards;
}

.art :deep(svg) {
  width: 100%;
  display: block;
}

.overlay :deep(.big) {
  width: 69cqw;
  border: none;
  border-radius: 999px;
  padding: 2.6cqw 0;
  font-size: 7cqw;
  font-weight: 600;
  line-height: 1.3;
}

.overlay :deep(.big.primary) {
  background: #6a9fd8;
  color: #fff;
}

.overlay :deep(.big.secondary) {
  background: #d9eafc;
  color: #6a9fd8;
}

.overlay :deep(.big.orange) {
  background: #f28a1e;
  color: #fff;
}

@keyframes fade {
  from {
    opacity: 0;
  }
}

@keyframes drop {
  from {
    transform: translateY(-6cqw) scale(0.6);
    opacity: 0;
  }
}

@keyframes rise {
  from {
    transform: translateY(8cqw);
    opacity: 0;
  }
}
</style>
