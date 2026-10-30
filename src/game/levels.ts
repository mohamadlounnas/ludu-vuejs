import type { DifficultyBand } from './generator'

/** Number of hand-checked levels shipped in `src/levels/levels.json`. */
export const PACK_SIZE = 300

/**
 * Board size per level. Like the original, boards reach 10×10 by level 29;
 * after level 40 sizes rotate between 9×9 and 11×11 for variety.
 */
const SIZE_STEPS: [lastLevel: number, size: number][] = [
  [2, 4],
  [5, 5],
  [9, 6],
  [14, 7],
  [20, 8],
  [26, 9],
  [40, 10],
]
const LATE_SIZES = [10, 11, 9, 11, 10, 11]

export function sizeForLevel(level: number): number {
  return SIZE_STEPS.find(([last]) => level <= last)?.[1] ?? LATE_SIZES[level % LATE_SIZES.length]
}

/**
 * Hardest deduction each level may need (logic-solver levels, see logic.ts):
 * singles only at first, then confinement, squeezes, and multi-group
 * confinement on later boards. Every third late level is a breather.
 */
export function bandForLevel(level: number): DifficultyBand {
  if (level <= 5) return { min: 0, max: 2 }
  if (level <= 12) return { min: 2, max: 3 }
  if (level <= 28) return { min: 3, max: 4 }
  if (level <= 60) return level % 3 === 0 ? { min: 2, max: 3 } : { min: 3, max: 5 }
  return level % 3 === 0 ? { min: 3, max: 3 } : { min: 4, max: 6 }
}

/** Fixed seed per level so every player gets the same board. */
export function seedForLevel(level: number): number {
  return (level * 7919 + 104729) >>> 0
}

export const DAILY_SIZE = 8
export const DAILY_BAND: DifficultyBand = { min: 3, max: 4 }
