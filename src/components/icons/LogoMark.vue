<script setup lang="ts">
/**
 * The "CAT GRID" wordmark, drawn as one SVG so its decorations stay glued to
 * the letters: a blue A with cat ears (that twitch now and then) and an
 * orange I with a striped tail (that swishes). Each letter is placed on its
 * own, so positions don't depend on the font's spacing. Letters drop in one
 * after another on load.
 */
const LINE1 = [
  { ch: 'C', x: 82 },
  { ch: 'A', x: 149, accent: 'blue' },
  { ch: 'T', x: 214 },
]
const LINE2 = [
  { ch: 'G', x: 70 },
  { ch: 'R', x: 134 },
  { ch: 'I', x: 180, accent: 'orange' },
  { ch: 'D', x: 230 },
]
</script>

<template>
  <svg class="logo-mark" viewBox="0 0 300 214" role="img">
    <title>CAT GRID</title>
    <g class="letters" font-size="96" font-weight="800" text-anchor="middle">
      <!-- cat ears on the A, behind its outline -->
      <g class="ears">
        <path class="ear-l" d="M128 44 L127 16 Q128 12 132 14 L150 32 Z" />
        <path class="ear-r" d="M170 44 L171 16 Q170 12 166 14 L148 32 Z" />
        <path d="M131.5 37 L131 21 L142 31.5 Z M166.5 37 L167 21 L156 31.5 Z" fill="#f5a9bb" />
      </g>
      <!-- the tail curling from the foot of the I -->
      <g class="tail">
        <path d="M181 178 C184 200 214 206 222 190 C227 179 216 171 208 180" fill="none" stroke="#fff" stroke-width="17" stroke-linecap="round" />
        <path d="M181 178 C184 200 214 206 222 190 C227 179 216 171 208 180" fill="none" stroke="#f28a1e" stroke-width="10" stroke-linecap="round" />
        <path d="M181 178 C184 200 214 206 222 190 C227 179 216 171 208 180" fill="none" stroke="#b9560b" stroke-width="10" stroke-dasharray="4 9" stroke-dashoffset="-6" />
      </g>
      <text
        v-for="(l, i) in LINE1"
        :key="`a${i}`"
        :x="l.x"
        y="92"
        class="letter"
        :class="l.accent"
        :style="{ animationDelay: `${i * 70}ms` }"
      >
        {{ l.ch }}
      </text>
      <text
        v-for="(l, i) in LINE2"
        :key="`b${i}`"
        :x="l.x"
        y="178"
        class="letter"
        :class="l.accent"
        :style="{ animationDelay: `${(i + 3) * 70}ms` }"
      >
        {{ l.ch }}
      </text>
    </g>
  </svg>
</template>

<style scoped>
.logo-mark {
  display: block;
  overflow: visible;
  filter: drop-shadow(0 1.2cqw 0 rgb(123 79 54 / 0.18));
}

.letter {
  fill: #7b4f36;
  stroke: #fff;
  stroke-width: 9px;
  stroke-linejoin: round;
  paint-order: stroke fill;
  transform-box: fill-box;
  transform-origin: 50% 100%;
  animation: drop 0.6s both;
}

.letter.blue {
  fill: #7f97f0;
}

.letter.orange {
  fill: #f28a1e;
}

.ears path:not([fill]) {
  fill: #7f97f0;
  stroke: #fff;
  stroke-width: 7px;
  stroke-linejoin: round;
  paint-order: stroke fill;
}

.ears,
.tail {
  animation: appear 0.4s 0.5s both;
}

.ear-l,
.ear-r {
  transform-box: fill-box;
  transform-origin: 50% 100%;
}

.ear-l {
  animation: twitch-l 6.5s 2s infinite;
}

.ear-r {
  animation: twitch-r 8.3s 4.5s infinite;
}

.tail {
  transform-box: view-box;
  transform-origin: 181px 178px;
  animation:
    appear 0.4s 0.5s both,
    swish 3.2s 1s ease-in-out infinite alternate;
}

/* Each letter drops in, squashes on landing and settles. */
@keyframes drop {
  0% {
    transform: translateY(-40%) scale(0.9, 1.1);
    opacity: 0;
    animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45);
  }
  45% {
    transform: translateY(0) scale(1.1, 0.88);
    opacity: 1;
    animation-timing-function: cubic-bezier(0.2, 0.8, 0.3, 1);
  }
  70% {
    transform: translateY(-4%) scale(0.97, 1.03);
  }
  100% {
    transform: none;
  }
}

@keyframes appear {
  from {
    opacity: 0;
  }
}

@keyframes twitch-l {
  0%,
  92%,
  100% {
    transform: none;
  }
  94% {
    transform: rotate(-14deg);
  }
  96% {
    transform: rotate(4deg);
  }
}

@keyframes twitch-r {
  0%,
  90%,
  100% {
    transform: none;
  }
  92% {
    transform: rotate(14deg);
  }
  94% {
    transform: rotate(-4deg);
  }
}

@keyframes swish {
  to {
    transform: rotate(-10deg);
  }
}
</style>
