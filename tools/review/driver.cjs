/**
 * Playwright helpers for screenshot reviews of the game.
 *
 *   const { open } = require('./tools/review/driver.cjs')
 *   const g = await open({ level: 29, lang: 'ar' })   // opens the game screen
 *   await g.tap(5); await g.doubleTap(g.catCell(3)); await g.shot('out/cat.png')
 *
 * Needs a server: `npm run build && npx vite preview --port 4173`.
 * Cells are row-major indexes. `g.state()` returns the live game state.
 */
const { chromium } = require('playwright')

const BASE = process.env.CATGRID_URL || 'http://localhost:4173/'

async function open({
  level = 1,
  lang = 'ar',
  mode = 'level',
  progress = {},
  viewport = { width: 390, height: 844 },
  scale = 2,
  home = false,
} = {}) {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport, deviceScaleFactor: scale, hasTouch: false })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(BASE + '?debug')
  await page.evaluate(
    (p) => localStorage.setItem('catgrid.progress.v1', JSON.stringify(p)),
    { level, points: 0, powerUps: { cat: 7, bulb: 7, mouse: 2 }, lang, daily: { last: '', streak: 0 }, ...progress },
  )
  await page.reload()
  if (!home) {
    await page.click(mode === 'daily' ? '.cta.daily' : '.cta.level')
    await page.waitForSelector('.board')
    await page.waitForTimeout(1300) // intro animation
  }

  const g = {
    page,
    browser,
    errors,
    state: () =>
      page.evaluate(() => {
        const s = window.__catgrid
        return s && {
          size: s.puzzle.value.size,
          regions: s.puzzle.value.regions,
          solution: s.puzzle.value.solution,
          marks: [...s.marks.value],
          fish: s.fish.value,
          status: s.status.value,
          score: s.score.value,
        }
      }),
    async catCell(row) {
      const s = await g.state()
      return row * s.size + s.solution[row]
    },
    async wrongCell(row) {
      const s = await g.state()
      return row * s.size + ((s.solution[row] + Math.ceil(s.size / 2)) % s.size)
    },
    async center(cell) {
      const box = await page.locator(`[data-cell="${cell}"]`).boundingBox()
      return { x: box.x + box.width / 2, y: box.y + box.height / 2, box }
    },
    async tap(cell) {
      const { x, y } = await g.center(cell)
      await page.mouse.click(x, y)
      await page.waitForTimeout(350) // let the double-tap window pass
    },
    async doubleTap(cell) {
      const { x, y } = await g.center(cell)
      await page.mouse.click(x, y)
      await page.waitForTimeout(60)
      await page.mouse.click(x, y)
    },
    async drag(cells) {
      const pts = await Promise.all(cells.map(g.center))
      await page.mouse.move(pts[0].x, pts[0].y)
      await page.mouse.down()
      for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y, { steps: 4 })
      await page.mouse.up()
    },
    click: (selector) => page.click(selector),
    wait: (ms) => page.waitForTimeout(ms),
    shot: (path, opts = {}) => page.screenshot({ path, ...opts }),
    close: () => browser.close(),
  }
  return g
}

module.exports = { open, BASE }
