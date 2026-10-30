<script setup lang="ts">
import { useId } from 'vue'

const id = useId()
</script>

<template>
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <radialGradient :id="id" cx="0.4" cy="0.35" r="0.7">
        <stop offset="0" stop-color="#fff3a6" />
        <stop offset="0.55" stop-color="#ffd23f" />
        <stop offset="1" stop-color="#f5a516" />
      </radialGradient>
    </defs>
    <path
      d="M50 6 C27 6 14 25 18 44 C21 57 33 63 35 73 L65 73 C67 63 79 57 82 44 C86 25 73 6 50 6 Z"
      :fill="`url(#${id})`"
    />
    <ellipse cx="37" cy="27" rx="8" ry="11" fill="#fff" opacity="0.6" transform="rotate(30 37 27)" />
    <rect x="34" y="72" width="32" height="18" rx="5" fill="#8c6fd8" />
    <path d="M35 78 H65 M35 84 H65" stroke="#6c52b8" stroke-width="2.5" />
    <path d="M41 90 Q50 99 59 90 Z" fill="#5e46a6" />
  </svg>
</template>
