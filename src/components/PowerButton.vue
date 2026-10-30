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
  box-shadow: 0 1.4cqw 2.6cqw rgb(240 170 120 / 0.28);
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
  width: 9.6cqw;
  height: 9.6cqw;
  filter: drop-shadow(0 0.4cqw 0.5cqw rgb(0 0 0 / 0.12));
}

/* Red pill badge hanging off the top-right, like the original. */
.badge {
  position: absolute;
  top: -1.9cqw;
  right: -2.6cqw;
  min-width: 5.8cqw;
  height: 4.3cqw;
  padding: 0 0.6cqw;
  border-radius: 2.15cqw;
  background: #e8323a;
  color: #fff;
  font-family: system-ui, sans-serif;
  font-size: 3.7cqw;
  font-weight: 500;
  line-height: 4.3cqw;
}
</style>
