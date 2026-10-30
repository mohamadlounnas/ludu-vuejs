<script setup lang="ts">
/**
 * Dev-only art sheet (`?gallery`): every character pose at a large size for
 * visual review. The poses are `still` so screenshots are repeatable; the
 * "lab" cat lives, and `window.__labCat` lets review scripts trigger its
 * behaviours (blink, glance, flick, tiltHead, sniff, yawn) and pet it.
 */
import { onMounted, ref } from 'vue'
import BulbIcon from '../icons/BulbIcon.vue'
import CatFace from '../icons/CatFace.vue'
import CatSilhouette from '../icons/CatSilhouette.vue'
import FishIcon from '../icons/FishIcon.vue'
import HugCat from '../icons/HugCat.vue'
import MouseIcon from '../icons/MouseIcon.vue'

const moods = ['happy', 'wink', 'worried', 'sad', 'joy'] as const
const lab = ref<InstanceType<typeof CatFace> | null>(null)
const pets = ref(0)
onMounted(() => {
  ;(window as unknown as { __labCat: unknown }).__labCat = { cat: lab.value, pet: () => pets.value++ }
})
const looks = [
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
  { x: 0.7, y: 0.7 },
]
</script>

<template>
  <div class="gallery" dir="ltr">
    <section>
      <figure v-for="m in moods" :key="m">
        <div class="tile"><CatFace :mood="m" still /></div>
        <figcaption>{{ m }}</figcaption>
      </figure>
    </section>
    <section>
      <figure v-for="(l, i) in looks" :key="i">
        <div class="tile" style="background: #9db7d1"><CatFace :look="l" still /></div>
        <figcaption>look {{ l.x }},{{ l.y }}</figcaption>
      </figure>
    </section>
    <section>
      <figure>
        <div class="tile lab"><CatFace ref="lab" :pet="pets" /></div>
        <figcaption>lab (alive)</figcaption>
      </figure>
    </section>
    <section>
      <figure><div class="hug"><HugCat happy /></div><figcaption>win</figcaption></figure>
      <figure><div class="hug dark"><HugCat /></div><figcaption>lose</figcaption></figure>
    </section>
    <section>
      <figure><div class="small"><CatSilhouette color="#f5b8c9" /></div><figcaption>strip</figcaption></figure>
      <figure><div class="small"><FishIcon /></div><figcaption>fish</figcaption></figure>
      <figure><div class="small"><FishIcon lost /></div><figcaption>lost</figcaption></figure>
      <figure><div class="small"><BulbIcon /></div><figcaption>bulb</figcaption></figure>
      <figure><div class="small"><MouseIcon /></div><figcaption>mouse</figcaption></figure>
    </section>
  </div>
</template>

<style scoped>
.gallery {
  padding: 16px;
  font-family: system-ui, sans-serif;
}

section {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

figure {
  margin: 0;
  text-align: center;
  font-size: 12px;
}

.tile {
  width: 140px;
  height: 140px;
  border-radius: 16px;
  background: #cf6767;
  display: grid;
  place-items: center;
}

.tile svg {
  width: 84%;
}

.hug {
  width: 200px;
  padding: 10px;
  border-radius: 16px;
  background: #f5efed;
}

.hug.dark {
  background: #1c1e26;
}

.small {
  width: 80px;
  height: 80px;
  display: grid;
  place-items: center;
}

.small svg {
  width: 90%;
}
</style>
