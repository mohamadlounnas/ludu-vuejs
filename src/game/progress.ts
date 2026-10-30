import { reactive, watch } from 'vue'

export type Lang = 'ar' | 'en'
export type PowerUp = 'cat' | 'bulb' | 'mouse'

export interface Progress {
  level: number
  points: number
  powerUps: Record<PowerUp, number>
  lang: Lang
}

const KEY = 'catgrid.progress.v1'

export const defaultProgress = (): Progress => ({
  level: 1,
  points: 0,
  powerUps: { cat: 3, bulb: 3, mouse: 1 },
  lang: 'ar',
})

function load(): Progress {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (saved) return { ...defaultProgress(), ...saved, powerUps: { ...defaultProgress().powerUps, ...saved.powerUps } }
  } catch {
    // Storage can be missing or blocked; start fresh.
  }
  return defaultProgress()
}

export const progress = reactive<Progress>(load())

watch(
  progress,
  () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(progress))
    } catch {
      // Ignore: progress just won't survive a reload.
    }
  },
  { deep: true },
)

/** Rewards for clearing a level: a bulb every level, a cat every 3rd, a mouse every 5th. */
export function rewardLevel(level: number) {
  progress.powerUps.bulb++
  if (level % 3 === 0) progress.powerUps.cat++
  if (level % 5 === 0) progress.powerUps.mouse++
}
