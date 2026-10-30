import { seedForLevel } from '../game/levels'
import type { Puzzle } from '../game/types'
import pack from './levels.json'

/** Compact level: size, regions and solution as base-36 digit strings, difficulty. */
export interface PackedLevel {
  s: number
  r: string
  c: string
  d: number
}

export const encodeLevel = (p: Puzzle): PackedLevel => ({
  s: p.size,
  r: p.regions.map((r) => r.toString(36)).join(''),
  c: p.solution.map((c) => c.toString(36)).join(''),
  d: p.difficulty ?? 0,
})

export const decodeLevel = (packed: PackedLevel, seed: number): Puzzle => ({
  size: packed.s,
  regions: [...packed.r].map((ch) => parseInt(ch, 36)),
  solution: [...packed.c].map((ch) => parseInt(ch, 36)),
  seed,
  difficulty: packed.d,
})

const levels = (pack as { levels: PackedLevel[] }).levels

/** The shipped puzzle for `level`, or null past the end of the pack. */
export function packedLevel(level: number): Puzzle | null {
  const packed = levels[level - 1]
  return packed ? decodeLevel(packed, seedForLevel(level)) : null
}

export const packLength = levels.length
