<script setup lang="ts">
defineProps<{ count: number; label: string }>()
defineEmits<{ use: [] }>()
</script>

<template>
  <button class="power" :aria-label="`${label} (${count})`" :disabled="count === 0" @click="$emit('use')">
    <slot />
    <span class="badge">{{ count }}</span>
  </button>
</template>

<style scoped>
.power {
  position: relative;
  width: 15cqw;
  height: 15cqw;
  border: none;
  border-radius: 50%;
  background: var(--card);
  box-shadow: var(--shadow);
  display: grid;
  place-items: center;
  padding: 0;
  transition: transform 0.1s;
}

.power:active {
  transform: scale(0.92);
}

.power:disabled {
  opacity: 0.55;
}

.power :deep(svg) {
  width: 9cqw;
  height: 9cqw;
}

.badge {
  position: absolute;
  top: -3cqw;
  right: -2.4cqw;
  min-width: 6.5cqw;
  height: 6.5cqw;
  padding: 0 1.2cqw;
  box-sizing: border-box;
  border-radius: 3.25cqw;
  background: var(--danger);
  color: #fff;
  font-size: 4.2cqw;
  font-weight: 700;
  line-height: 6.7cqw;
}
</style>
