/**
 * Frame-exact film strips of CSS animations.
 *
 *   const { filmstrip } = require('./tools/review/filmstrip.cjs')
 *   await filmstrip(g, async () => g.doubleTap(cell), [0, 40, 80, ...], 'out/land.png', { clip })
 *
 * Runs `trigger`, pauses every running animation at once, then seeks them to
 * each time (ms since the trigger) and screenshots `clip` (CSS px). Frames
 * are stitched left to right with their time printed under each.
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

async function filmstrip(g, trigger, times, out, { clip, columns = times.length } = {}) {
  const { page } = g
  await trigger()
  // Freeze: remember each animation's time at the moment of the trigger.
  await page.evaluate(() => {
    window.__frozen = document.getAnimations().map((a) => {
      a.pause()
      return { a, t0: a.currentTime ?? 0 }
    })
  })
  const dir = fs.mkdtempSync(path.join(path.dirname(out), '.frames-'))
  const files = []
  for (const t of times) {
    await page.evaluate((ms) => {
      for (const f of window.__frozen) f.a.currentTime = f.t0 + ms
      // Animations created after the trigger (e.g. delayed effects) are caught too.
      for (const a of document.getAnimations()) {
        if (!window.__frozen.some((f) => f.a === a)) {
          a.pause()
          window.__frozen.push({ a, t0: (a.currentTime ?? 0) - ms })
          a.currentTime = ms
        }
      }
    }, t)
    const file = path.join(dir, `f${String(t).padStart(5, '0')}.png`)
    await page.screenshot({ path: file, clip })
    files.push([file, `${t}ms`])
  }
  await page.evaluate(() => window.__frozen.forEach((f) => f.a.play()))
  execFileSync('python3', [path.join(__dirname, 'stitch.py'), out, String(columns), ...files.flat()])
  fs.rmSync(dir, { recursive: true })
  return out
}

module.exports = { filmstrip }
