<script setup lang="ts">
/**
 * Paper confetti: each piece falls at its own terminal speed, sways from
 * side to side, and flips in 3D like real paper. Randomised once per mount.
 */
const COLORS = ['#cf6767', '#ff9f62', '#dfb03e', '#a4d288', '#3faba9', '#5eb3e4', '#8b6bd1', '#e879ad', '#ffd23f']
const rand = (min: number, max: number) => min + Math.random() * (max - min)
const pieces = Array.from({ length: 80 }, (_, i) => ({
  left: rand(-5, 105),
  delay: rand(0, 700),
  fall: rand(2200, 3600),
  sway: rand(700, 1300),
  swayX: rand(2, 6),
  flip: rand(350, 900),
  axis: `${rand(0.2, 1).toFixed(2)}, ${rand(0.2, 1).toFixed(2)}, ${rand(0, 0.5).toFixed(2)}`,
  color: COLORS[i % COLORS.length],
  shape: i % 5 === 0 ? 'round' : i % 3 === 0 ? 'strip' : 'square',
}))
</script>

<template>
  <div class="confetti" aria-hidden="true">
    <i
      v-for="(p, i) in pieces"
      :key="i"
      class="piece"
      :style="{ left: `${p.left}%`, animationDelay: `${p.delay}ms`, animationDuration: `${p.fall}ms` }"
    >
      <span class="sway" :style="{ animationDuration: `${p.sway}ms`, '--sx': `${p.swayX}cqw` }">
        <b
          :class="p.shape"
          :style="{ background: p.color, animationDuration: `${p.flip}ms`, '--axis': p.axis }"
        />
      </span>
    </i>
  </div>
</template>

<style scoped>
.confetti {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 20;
  perspective: 600px;
}

.piece {
  position: absolute;
  top: -6vh;
  animation: fall cubic-bezier(0.3, 0.1, 0.6, 1) both;
}

.sway {
  display: block;
  animation: sway ease-in-out infinite alternate;
}

b {
  display: block;
  width: 2cqw;
  height: 2.8cqw;
  border-radius: 0.3cqw;
  backface-visibility: visible;
  animation: flip linear infinite;
  box-shadow: inset 0 0 0 0.2cqw rgb(255 255 255 / 0.15);
}

b.strip {
  width: 1.2cqw;
  height: 4cqw;
}

b.round {
  width: 2.2cqw;
  height: 2.2cqw;
  border-radius: 50%;
}

@keyframes fall {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(115vh);
  }
}

@keyframes sway {
  from {
    transform: translateX(calc(var(--sx) * -1)) rotate(-18deg);
  }
  to {
    transform: translateX(var(--sx)) rotate(18deg);
  }
}

@keyframes flip {
  from {
    transform: rotate3d(var(--axis), 0deg);
  }
  to {
    transform: rotate3d(var(--axis), 360deg);
  }
}
</style>
