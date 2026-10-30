<template>
  <div class="backdrop">
    <div class="card" role="dialog" aria-modal="true">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(80 50 40 / 0.35);
  animation: fade 0.2s ease-out;
  z-index: 10;
}

.card {
  width: min(84cqw, 400px);
  box-sizing: border-box;
  padding: 6cqw 5cqw;
  border-radius: 5cqw;
  background: var(--card);
  box-shadow: var(--shadow);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3cqw;
  animation: rise 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes fade {
  from {
    opacity: 0;
  }
}

@keyframes rise {
  from {
    transform: translateY(6cqw) scale(0.9);
    opacity: 0;
  }
}
</style>
