<script setup lang="ts">
/**
 * The coach's paw: a white cat paw whose middle toe bean taps at (`x`, `y`)
 * in its positioned parent, with a ripple per tap. It never takes a tap
 * itself (pointer-events: none), so the player taps right through it.
 * A tap loops every 900ms; a double-tap taps twice, 180ms apart, then rests.
 */
defineProps<{ x: string; y: string; double?: boolean }>()
</script>

<template>
  <div class="finger" :class="{ double }" :style="{ left: x, top: y }" aria-hidden="true">
    <i class="ripple" />
    <i v-if="double" class="ripple second" />
    <svg class="paw" viewBox="0 0 48 84">
      <g v-for="layer in ['outline', 'fill']" :key="layer" :class="layer">
        <path d="M11 70 L11 40 L37 40 L37 70" />
        <ellipse cx="24" cy="30" rx="17" ry="15" />
        <circle cx="11.5" cy="20" r="6.5" />
        <circle cx="24" cy="14.5" r="7" />
        <circle cx="36.5" cy="20" r="6.5" />
      </g>
      <g class="beans">
        <ellipse cx="12" cy="20.5" rx="3.3" ry="3.8" />
        <ellipse cx="24" cy="15" rx="3.5" ry="4" />
        <ellipse cx="36" cy="20.5" rx="3.3" ry="3.8" />
        <path d="M24 26 C30 26 33 31 33 34 C33 37 30 38 27.5 37.5 C26 37.2 25 37 24 37 C23 37 22 37.2 20.5 37.5 C18 38 15 37 15 34 C15 31 18 26 24 26 Z" />
      </g>
    </svg>
  </div>
</template>

<style scoped>
/* A zero-size anchor on the target; it glides when the target moves. */
.finger {
  position: absolute;
  z-index: 4;
  width: 0;
  height: 0;
  pointer-events: none;
  transition:
    left 520ms cubic-bezier(0.45, 0, 0.25, 1),
    top 520ms cubic-bezier(0.45, 0, 0.25, 1);
}

/* The middle toe bean (24, 15 of 48×84) sits on the anchor; the arm leans in from the bottom right. */
.paw {
  position: absolute;
  left: calc(-9cqw * 24 / 48);
  top: calc(-9cqw * 84 / 48 * 15 / 84);
  width: 9cqw;
  overflow: visible;
  transform-origin: 50% calc(15 / 84 * 100%);
  rotate: -22deg;
  /* The forearm fades out, so the paw never looks cut off. */
  mask-image: linear-gradient(to bottom, #000 48%, transparent 80%);
  animation: tap 900ms infinite;
}

/* Every part's outline first, then every part's fill: one clean outline around the whole paw. */
.outline {
  fill: none;
  stroke: var(--text);
  stroke-width: 5;
  stroke-linejoin: round;
}

.fill {
  fill: #fff;
}

.beans {
  fill: #f7a8c4;
}

/*
 * One tap: the paw presses in (squashed), springs back, rises away from the
 * screen (bigger, with a wider shadow), hangs, then drops with gravity.
 */
@keyframes tap {
  0% {
    transform: scale(1.05, 0.92);
    filter: drop-shadow(0 0.3cqw 0.3cqw rgb(80 40 30 / 0.3));
    animation-timing-function: cubic-bezier(0.2, 0.8, 0.3, 1);
  }
  14% {
    transform: none;
    filter: drop-shadow(0 0.4cqw 0.4cqw rgb(80 40 30 / 0.28));
    animation-timing-function: cubic-bezier(0.25, 0.6, 0.4, 1);
  }
  58% {
    transform: translate(1.2cqw, 1.6cqw) rotate(5deg) scale(1.1);
    filter: drop-shadow(0.6cqw 1.4cqw 1cqw rgb(80 40 30 / 0.18));
    animation-timing-function: ease-in-out;
  }
  72% {
    transform: translate(1.2cqw, 1.6cqw) rotate(5deg) scale(1.1);
    filter: drop-shadow(0.6cqw 1.4cqw 1cqw rgb(80 40 30 / 0.18));
    animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45);
  }
  100% {
    transform: scale(1.05, 0.92);
    filter: drop-shadow(0 0.3cqw 0.3cqw rgb(80 40 30 / 0.3));
  }
}

.double .paw {
  animation: double-tap 1600ms infinite;
}

/* Two quick taps (0 and 180ms), a little hop between them, then a rest in the air. */
@keyframes double-tap {
  0% {
    transform: scale(1.05, 0.92);
    filter: drop-shadow(0 0.3cqw 0.3cqw rgb(80 40 30 / 0.3));
    animation-timing-function: cubic-bezier(0.2, 0.8, 0.3, 1);
  }
  5.5% {
    transform: translate(0.4cqw, 0.6cqw) scale(1.03);
    filter: drop-shadow(0.2cqw 0.6cqw 0.5cqw rgb(80 40 30 / 0.25));
    animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45);
  }
  11.25% {
    transform: scale(1.05, 0.92);
    filter: drop-shadow(0 0.3cqw 0.3cqw rgb(80 40 30 / 0.3));
    animation-timing-function: cubic-bezier(0.2, 0.8, 0.3, 1);
  }
  20% {
    transform: none;
    filter: drop-shadow(0 0.4cqw 0.4cqw rgb(80 40 30 / 0.28));
    animation-timing-function: cubic-bezier(0.25, 0.6, 0.4, 1);
  }
  48%,
  84% {
    transform: translate(1.2cqw, 1.6cqw) rotate(5deg) scale(1.1);
    filter: drop-shadow(0.6cqw 1.4cqw 1cqw rgb(80 40 30 / 0.18));
    animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45);
  }
  100% {
    transform: scale(1.05, 0.92);
    filter: drop-shadow(0 0.3cqw 0.3cqw rgb(80 40 30 / 0.3));
  }
}

/* A ring spreading from the touch, fading as it grows. */
.ripple {
  position: absolute;
  left: -5cqw;
  top: -5cqw;
  width: 10cqw;
  height: 10cqw;
  box-sizing: border-box;
  border-radius: 50%;
  border: 0.8cqw solid #fff;
  /* A thin dark rim, so the ring reads on the palest regions too. */
  box-shadow:
    0 0 0 0.25cqw rgb(139 87 83 / 0.45),
    inset 0 0 0 0.25cqw rgb(139 87 83 / 0.45);
  opacity: 0;
  animation: ripple 900ms cubic-bezier(0.2, 0.6, 0.35, 1) infinite;
}

@keyframes ripple {
  from {
    transform: scale(0.6);
    opacity: 0.95;
  }
  to {
    transform: scale(1.6);
    opacity: 0;
  }
}

/* Double-tap: each ring spreads for 700ms of the 1600ms loop, the second 180ms after the first. */
.double .ripple {
  animation: ripple-double 1600ms linear infinite;
}

.double .ripple.second {
  animation-delay: 180ms;
}

@keyframes ripple-double {
  0% {
    transform: scale(0.6);
    opacity: 0.95;
    animation-timing-function: cubic-bezier(0.2, 0.6, 0.35, 1);
  }
  43.75%,
  100% {
    transform: scale(1.6);
    opacity: 0;
  }
}
</style>
