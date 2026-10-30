/**
 * Real-time video of a scenario, for effects driven by timers rather than
 * CSS alone. Records with Playwright, then extracts frames with ffmpeg.
 *
 *   node tools/review/record.cjs <outDir> <scenario.cjs>
 * The scenario module exports `async (g) => {...}` using the driver API; it
 * may call `g.mark(label)` to note moments (printed with their times).
 */
const { chromium } = require('playwright')
const path = require('node:path')
const fs = require('node:fs')

;(async () => {
  const [outDir, scenarioPath] = process.argv.slice(2)
  const scenario = require(path.resolve(scenarioPath))
  fs.mkdirSync(outDir, { recursive: true })
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    recordVideo: { dir: outDir, size: { width: 390, height: 844 } },
  })
  const page = await context.newPage()
  const BASE = process.env.CATGRID_URL || 'http://localhost:4173/'
  await page.goto(BASE + '?debug')
  const t0 = Date.now()
  const marks = []
  const g = { page, mark: (label) => marks.push(`${((Date.now() - t0) / 1000).toFixed(2)}s ${label}`) }
  await scenario(g, BASE)
  await page.waitForTimeout(300)
  const video = await page.video().path()
  await context.close()
  await browser.close()
  fs.renameSync(video, path.join(outDir, 'run.webm'))
  console.log(marks.join('\n'))
})()
