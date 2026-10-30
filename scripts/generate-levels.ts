/**
 * Builds the level pack: `npm run levels` (optionally `-- --count 300`).
 * Each level is generated from its fixed seed, in its difficulty band, on
 * all CPU cores, and written to src/levels/levels.json.
 */
import { fork } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { fileURLToPath } from 'node:url'
import { generatePuzzle } from '../src/game/generator'
import { bandForLevel, PACK_SIZE, seedForLevel, sizeForLevel } from '../src/game/levels'
import { encodeLevel, type PackedLevel } from '../src/levels/pack'

const self = fileURLToPath(import.meta.url)
const arg = (name: string) => process.argv[process.argv.indexOf(`--${name}`) + 1]

if (process.argv.includes('--worker')) {
  const [part, parts, count] = [Number(arg('part')), Number(arg('parts')), Number(arg('count'))]
  for (let level = 1 + part; level <= count; level += parts) {
    const puzzle = generatePuzzle(sizeForLevel(level), seedForLevel(level), bandForLevel(level), 2000)
    process.send!({ level, packed: encodeLevel(puzzle) })
  }
  process.exit(0)
}

const count = process.argv.includes('--count') ? Number(arg('count')) : PACK_SIZE
const parts = cpus().length
const levels: PackedLevel[] = []
const started = Date.now()
let done = 0

await Promise.all(
  Array.from({ length: parts }, (_, part) => {
    const child = fork(self, ['--worker', '--part', String(part), '--parts', String(parts), '--count', String(count)], {
      execArgv: ['--import', 'tsx'],
    })
    child.on('message', ({ level, packed }: { level: number; packed: PackedLevel }) => {
      levels[level - 1] = packed
      if (++done % 25 === 0) console.log(`${done}/${count} levels (${((Date.now() - started) / 1000).toFixed(0)}s)`)
    })
    return new Promise<void>((resolve, reject) =>
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker ${part} failed`)))),
    )
  }),
)

const out = new URL('../src/levels/levels.json', import.meta.url)
writeFileSync(out, JSON.stringify({ version: 1, levels }) + '\n')
const histogram: Record<number, number> = {}
for (const l of levels) histogram[l.d] = (histogram[l.d] ?? 0) + 1
console.log(`Wrote ${levels.length} levels in ${((Date.now() - started) / 1000).toFixed(0)}s; difficulty histogram`, histogram)
