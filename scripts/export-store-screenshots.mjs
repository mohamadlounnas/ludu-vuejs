import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
const root = new URL('../release/screenshots/', import.meta.url)
for (const lang of ['ar', 'en']) await mkdir(new URL(`google-play/${lang}/`, root), { recursive: true })
for (const [source, target] of [
  ['ar-home-final.jpg', 'ar/01-home.png'],
  ['ar-board.jpg', 'ar/02-game.png'],
  ['en-home-web.jpg', 'en/01-home.png'],
  ['en-playing-full.jpg', 'en/02-game.png'],
]) {
  const input = fileURLToPath(new URL(`raw/${source}`, root))
  const meta = await sharp(input).metadata()
  let shot = sharp(input)
  // Desktop review captures include the page's side margins. Keep the actual
  // centered game column; the phone captures already have their proper bounds.
  if (meta.width > 900) {
    const width = Math.round(meta.height / 2.02)
    shot = shot.extract({ left: Math.round((meta.width - width) / 2), top: 0, width, height: meta.height })
  }
  // Fit without stretching or inventing any UI; neutral margins provide the
  // store-required 9:16 canvas. Raw captures remain available for inspection.
  await shot.resize(1080, 1920, { fit: 'contain', background: '#f5efed' }).removeAlpha().png().toFile(fileURLToPath(new URL(`google-play/${target}`, root)))
}
