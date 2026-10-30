<script setup lang="ts">
/** A one-shot burst of falling confetti (pure CSS, randomised once per mount). */
const COLORS = ['#cf6767', '#ff9f62', '#dfb03e', '#a4d288', '#3faba9', '#5eb3e4', '#8b6bd1', '#e879ad']
const pieces = Array.from({ length: 70 }, (_, i) => ({
  left: Math.random() * 100,
  delay: Math.random() * 600,
  duration: 1600 + Math.random() * 1400,
  drift: (Math.random() - 0.5) * 40,
  spin: (Math.random() - 0.5) * 1440,
  color: COLORS[i % COLORS.length],
  round: Math.random() < 0.3,
}))
</script>

<template>
  <div class="confetti" aria-hidden="true">
    <i
      v-for="(p, i) in pieces"
      :key="i"
      :class="{ round: p.round }"
      :style="{
        left: `${p.left}%`,
        background: p.color,
        animationDelay: `${p.delay}ms`,
        animationDuration: `${p.duration}ms`,
        '--drift': `${p.drift}cqw`,
        '--spin': `${p.spin}deg`,
      }"
    />
  </div>
</template>

<style scoped>
.confetti {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 20;
}

i {
  position: absolute;
  top: -4cqw;
  width: 2cqw;
  height: 3.2cqw;
  border-radius: 0.4cqw;
  animation: fall linear both;
}

i.round {
  width: 2.2cqw;
  height: 2.2cqw;
  border-radius: 50%;
}

@keyframes fall {
  from {
    transform: translate(0, 0) rotate(0);
  }
  to {
    transform: translate(var(--drift), 115vh) rotate(var(--spin));
  }
}
</style>
