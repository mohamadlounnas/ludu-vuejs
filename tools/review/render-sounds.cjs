/**
 * Renders every sound of the `?soundlab` page to WAV files, offline and
 * through the game's own room and compressor, for spectrogram review.
 *
 *   node tools/review/render-sounds.cjs [outDir] [name ...]
 *   python3 tools/review/spectrogram.py outDir/sheet.png outDir/*.wav
 *
 * Uses the server at CATGRID_URL (default http://localhost:4173/); if
 * nothing answers there it previews the last build (`npm run build` first).
 */
const { chromium } = require('playwright')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const BASE = process.env.CATGRID_URL || 'http://localhost:4173/'

const up = () =>
  fetch(BASE)
    .then((r) => r.ok)
    .catch(() => false)

/** Starts `vite preview` on the base URL's port if nothing serves there yet; resolves to a function that stops it. */
async function serve() {
  if (await up()) return () => {}
  const port = new URL(BASE).port || '4173'
  const root = path.resolve(__dirname, '../..')
  // In its own process group, so stopping it stops vite too, not just npx (and nothing else).
  const server = spawn('npx', ['vite', 'preview', '--port', port, '--strictPort'], { cwd: root, stdio: 'ignore', detached: true })
  const stop = () => process.kill(-server.pid, 'SIGTERM')
  for (let i = 0; i < 100; i++) {
    if (await up()) return stop
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  stop()
  throw new Error(`No server at ${BASE}`)
}

async function main() {
  const [outDir = 'out/sounds', ...only] = process.argv.slice(2)
  fs.mkdirSync(outDir, { recursive: true })
  const stopServer = await serve()
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(BASE + '?soundlab')
    await page.waitForFunction(() => window.__renderSound)
    const names = only.length ? only : await page.evaluate(() => window.__soundNames)
    for (const name of names) {
      const base64 = await page.evaluate((n) => window.__renderSound(n), name)
      const file = path.join(outDir, `${name}.wav`)
      fs.writeFileSync(file, Buffer.from(base64, 'base64'))
      console.log(file)
    }
    if (errors.length) console.error('Page errors:\n' + errors.join('\n'))
  } finally {
    await browser.close()
    stopServer()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
