import { reactive, watch } from 'vue'

export type Lang = 'ar' | 'en'
export type PowerUp = 'cat' | 'bulb' | 'mouse'

export interface Progress {
  level: number
  points: number
  powerUps: Record<PowerUp, number>
  lang: Lang
  /** Last daily challenge solved (YYYY-MM-DD, UTC) and the run of days in a row. */
  daily: { last: string; streak: number }
  settings: { sound: boolean; vibrate: boolean }
}

const KEY = 'catgrid.progress.v1'

export const defaultProgress = (): Progress => ({
  level: 1,
  points: 0,
  powerUps: { cat: 3, bulb: 3, mouse: 1 },
  lang: 'ar',
  daily: { last: '', streak: 0 },
  settings: { sound: true, vibrate: true },
})

function load(): Progress {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (saved) {
      const base = defaultProgress()
      return {
        ...base,
        ...saved,
        powerUps: { ...base.powerUps, ...saved.powerUps },
        settings: { ...base.settings, ...saved.settings },
      }
    }
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

export const dayKey = (date: Date) => date.toISOString().slice(0, 10)

export function dailyDone(now = new Date()): boolean {
  return progress.daily.last === dayKey(now)
}

export function completeDaily(now = new Date()) {
  if (dailyDone(now)) return
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000))
  progress.daily = { last: dayKey(now), streak: progress.daily.last === yesterday ? progress.daily.streak + 1 : 1 }
}

/** Rewards for clearing a level: a bulb every level, a cat every 3rd, a mouse every 5th. */
export function rewardLevel(level: number) {
  progress.powerUps.bulb++
  if (level % 3 === 0) progress.powerUps.cat++
  if (level % 5 === 0) progress.powerUps.mouse++
}
