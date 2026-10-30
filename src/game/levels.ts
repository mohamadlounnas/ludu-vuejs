import { MAX_SIZE } from './generator'

/** Board size per level: short tutorial boards, then a slow climb to 11×11. */
const SIZE_STEPS: [lastLevel: number, size: number][] = [
  [2, 4],
  [5, 5],
  [9, 6],
  [14, 7],
  [20, 8],
  [26, 9],
  [40, 10],
]

export function sizeForLevel(level: number): number {
  return SIZE_STEPS.find(([last]) => level <= last)?.[1] ?? MAX_SIZE
}

/** Fixed seed per level so every player gets the same board. */
export function seedForLevel(level: number): number {
  return (level * 7919 + 104729) >>> 0
}

export function pointsForWin(size: number, fishLeft: number): number {
  return size * 2 + fishLeft
}
