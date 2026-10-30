<template>
  <svg viewBox="0 0 100 100" aria-hidden="true" class="heart">
    <path class="half left" d="M50 30 C40 10 8 12 8 40 C8 62 34 76 50 90 L44 66 L55 52 L45 40 Z" />
    <path class="half right" d="M50 30 C60 10 92 12 92 40 C92 62 66 76 50 90 L44 66 L55 52 L45 40 Z" />
  </svg>
</template>

<style scoped>
.half {
  fill: #fff;
  transform-box: fill-box;
}

/* Pops in whole, then cracks apart (timed to MISTAKE_MS). */
.heart {
  animation: beat 0.35s 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
}

.left {
  transform-origin: 100% 100%;
  animation: split-left 0.3s 0.65s ease-in forwards;
}

.right {
  transform-origin: 0 100%;
  animation: split-right 0.3s 0.65s ease-in forwards;
}

@keyframes beat {
  from {
    transform: scale(0);
  }
}

@keyframes split-left {
  to {
    transform: translate(-8%, 6%) rotate(-18deg);
  }
}

@keyframes split-right {
  to {
    transform: translate(8%, 6%) rotate(18deg);
  }
}
</style>
