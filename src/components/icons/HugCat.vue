<script setup lang="ts">
/** Tuxedo cat hugging a fish cracker: crying over a broken one, or beaming with a whole one. */
defineProps<{ happy?: boolean }>()
</script>

<template>
  <svg viewBox="0 0 200 230" aria-hidden="true">
    <path d="M48 170 C14 172 10 136 30 128" stroke="#232328" stroke-width="13" stroke-linecap="round" fill="none" />
    <circle cx="30" cy="128" r="8" fill="#fff" />
    <path d="M52 120 C50 80 150 80 148 120 L152 196 C152 214 48 214 48 196 Z" fill="#232328" />
    <path d="M72 120 C80 100 120 100 128 120 L132 190 C120 204 80 204 68 190 Z" fill="#fff" />
    <ellipse cx="74" cy="208" rx="20" ry="12" fill="#fff" />
    <ellipse cx="126" cy="208" rx="20" ry="12" fill="#fff" />
    <path d="M66 210 V202 M74 212 V202 M82 210 V202 M118 210 V202 M126 212 V202 M134 210 V202" stroke="#d9d0cc" stroke-width="2" stroke-linecap="round" />

    <g v-if="happy" transform="translate(100 150) rotate(-8)">
      <path d="M-40 0 C-36 -26 0 -32 14 -10 L34 -24 C40 -28 46 -22 42 -14 L36 0 L42 14 C46 22 40 28 34 24 L14 10 C0 32 -36 26 -40 0 Z" fill="#f6bd36" stroke="#e29a16" stroke-width="3" stroke-linejoin="round" />
      <circle cx="-24" cy="-6" r="3.5" fill="#6b4214" />
      <path d="M-6 8 Q0 16 8 8" stroke="#e29a16" stroke-width="3" fill="none" stroke-linecap="round" />
    </g>
    <g v-else transform="translate(100 150) rotate(-8)">
      <path d="M-34 -2 C-34 -26 -6 -30 2 -12 L2 26 C-14 34 -34 22 -34 -2 Z" fill="#f6bd36" stroke="#e29a16" stroke-width="3" />
      <path d="M8 -14 C14 -30 40 -24 42 -6 L52 -16 C58 -18 60 -10 56 -4 L50 6 L56 16 C58 24 50 26 46 20 L40 12 C34 30 14 34 8 24 L14 10 L6 0 Z" fill="#f6bd36" stroke="#e29a16" stroke-width="3" stroke-linejoin="round" />
      <circle cx="-20" cy="-6" r="3.5" fill="#6b4214" />
    </g>
    <ellipse cx="62" cy="146" rx="15" ry="13" fill="#fff" />
    <ellipse cx="138" cy="152" rx="15" ry="13" fill="#fff" />

    <g transform="translate(100 70)">
      <path d="M-62 4 L-60 -46 Q-58 -54 -50 -50 L-18 -30 Z" fill="#232328" />
      <path d="M62 4 L60 -46 Q58 -54 50 -50 L18 -30 Z" fill="#232328" />
      <path d="M-52 -10 L-51 -38 L-30 -26 Z" fill="#f4a9b4" />
      <path d="M52 -10 L51 -38 L30 -26 Z" fill="#f4a9b4" />
      <ellipse cx="0" cy="8" rx="64" ry="50" fill="#232328" />
      <path d="M0 -30 C-6 -14 -12 -4 -26 8 C-44 24 -36 56 0 56 C36 56 44 24 26 8 C12 -4 6 -14 0 -30 Z" fill="#fff" />
      <template v-if="happy">
        <path d="M-36 12 Q-24 -2 -12 12 M12 12 Q24 -2 36 12" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" />
        <ellipse cx="-36" cy="26" rx="8" ry="5" fill="#f7a8b8" opacity="0.8" />
        <ellipse cx="36" cy="26" rx="8" ry="5" fill="#f7a8b8" opacity="0.8" />
        <path d="M-6 26 Q0 22 6 26 Q0 32 0 32 Q0 32 -6 26 Z" fill="#f08a9a" />
        <path d="M-12 36 Q0 52 12 36 Z" fill="#7d2f3c" />
        <ellipse cx="0" cy="44" rx="5" ry="3" fill="#f27d8f" />
      </template>
      <template v-else>
        <path d="M-40 -12 L-18 -4 M40 -12 L18 -4" stroke="#fff" stroke-width="4" stroke-linecap="round" />
        <ellipse cx="-24" cy="10" rx="13" ry="14" fill="#fff" />
        <ellipse cx="24" cy="10" rx="13" ry="14" fill="#fff" />
        <circle cx="-22" cy="13" r="9" fill="#3a2a22" />
        <circle cx="22" cy="13" r="9" fill="#3a2a22" />
        <circle cx="-19" cy="9" r="3" fill="#fff" />
        <circle cx="25" cy="9" r="3" fill="#fff" />
        <path d="M-32 22 Q-36 34 -30 40 Q-24 34 -28 22 Z" fill="#7cc4f0" />
        <path d="M32 22 Q36 34 30 40 Q24 34 28 22 Z" fill="#7cc4f0" />
        <path d="M-6 26 Q0 22 6 26 Q0 32 0 32 Q0 32 -6 26 Z" fill="#f08a9a" />
        <path d="M-10 42 Q0 34 10 42" stroke="#3a3a40" stroke-width="3" stroke-linecap="round" fill="none" />
      </template>
    </g>
  </svg>
</template>
