<script setup lang="ts">
import { t, type MessageKey } from '../i18n'
import CatFace from './icons/CatFace.vue'
import XMark from './icons/XMark.vue'

// Mini 3×3 examples: x = crossed cell, c = cat, . = empty.
// Same order and layout in both languages, as in the reference.
const RULES: { text: MessageKey; cells: string }[] = [
  { text: 'ruleColor', cells: 'xxxxc.x..' },
  { text: 'ruleLine', cells: 'xcx.x..x.' },
  { text: 'ruleTouch', cells: 'xxxxcxxxx' },
]
</script>

<template>
  <section class="rules" dir="ltr">
    <div v-for="rule in RULES" :key="rule.text" class="rule">
      <div class="mini" dir="ltr">
        <span v-for="(c, i) in rule.cells" :key="i" :class="c === '.' ? 'empty' : 'filled'">
          <XMark v-if="c === 'x'" />
          <CatFace v-else-if="c === 'c'" class="mini-cat" />
        </span>
      </div>
      <p dir="auto">{{ t(rule.text) }}</p>
    </div>
  </section>
</template>

<style scoped>
.rules {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.9cqw;
  margin: 0 3.2cqw;
  padding: 1.9cqw;
  background: var(--card);
  border-radius: 3.2cqw;
}

.rule {
  display: flex;
  align-items: center;
  gap: 1.1cqw;
  padding: 1.3cqw 1cqw;
  background: var(--tile);
  border-radius: 1.3cqw;
  min-height: 8.4cqw;
}

.mini {
  flex: none;
  display: grid;
  grid-template-columns: repeat(3, 2.5cqw);
  gap: 0.35cqw;
}

.mini span {
  width: 2.5cqw;
  height: 2.5cqw;
  border-radius: 0.3cqw;
  display: grid;
  place-items: center;
  color: #fff;
}

.mini .filled {
  background: var(--mini);
}

.mini .empty {
  background: var(--mini-empty);
}

.mini svg {
  width: 100%;
}

.mini .mini-cat {
  width: 90%;
}

.mini span:has(.mini-cat) {
  background: var(--mini-empty);
}

p {
  margin: 0;
  font-size: 2.8cqw;
  line-height: 1.25;
  text-align: left;
  color: var(--text);
  font-weight: 500;
}
</style>
