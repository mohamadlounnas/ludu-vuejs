/** Region colors sampled pixel-exact from the screen recording (level 29). */
export const REGION_COLORS = [
  '#cf6767', // red
  '#ff9f62', // orange
  '#dfb03e', // mustard
  '#a4d288', // green
  '#3faba9', // teal
  '#5eb3e4', // blue
  '#9db7d1', // slate
  '#8b6bd1', // purple
  '#e879ad', // pink
  '#f9aac9', // light pink
  '#c99a6e', // tan (11×11 boards only)
]

export const pastel = (color: string) => `color-mix(in srgb, ${color} 50%, white)`

/**
 * Marking inks: 0 is the game's white pen; 1-3 are test colours. Each has a
 * halo in a contrasting colour so it reads on every region colour. On the
 * board (dir=ltr) each test ink owns a corner for its pips: 1 top-left,
 * 2 top-right, 3 bottom-left.
 */
export const INKS = [
  { color: '#ffffff', halo: '' },
  { color: '#22305c', halo: '#ffffff' }, // navy
  { color: '#ffd60a', halo: '#4a3300' }, // yellow
  { color: '#aa00ff', halo: '#ffffff' }, // violet: far from the red mistake X and from every region
]

/**
 * One 20×20 tile per region (by index, same order as REGION_COLORS), drawn
 * in `ink`, so regions differ by more than their colour. Red stays plain.
 */
const PATTERN_SHAPES = [
  '', // red: plain
  `<circle cx='5' cy='5' r='2.2'/><circle cx='15' cy='15' r='2.2'/>`, // orange: dots
  `<path fill='none' stroke-width='2.6' d='M-5 5L5-5M0 20L20 0M15 25L25 15'/>`, // mustard: ╱
  `<path fill='none' stroke-width='2.6' d='M0 5H20M0 15H20'/>`, // green: horizontal lines
  `<path d='M0 0H10V10H0ZM10 10H20V20H10Z'/>`, // teal: checker
  `<path fill='none' stroke-width='2.6' d='M-5 15L5 25M0 0L20 20M15-5L25 5'/>`, // blue: ╲
  `<circle fill='none' stroke-width='2.2' cx='10' cy='10' r='5'/>`, // slate: rings
  `<path fill='none' stroke-width='1.8' d='M0 0L20 20M20 0L0 20M-5 5L5-5M15 25L25 15M-5 15L5 25M15-5L25 5'/>`, // purple: crosshatch
  `<path fill='none' stroke-width='2.6' d='M5 0V20M15 0V20'/>`, // pink: vertical lines
  `<path fill='none' stroke-width='2.4' stroke-linejoin='round' d='M0 14L10 6L20 14'/>`, // light pink: chevrons
  `<path fill='none' stroke-width='1.8' d='M0 10H20M10 0V20'/>`, // tan: grid
]

/** A region's pattern as a CSS image (`none` for plain red). */
export const regionPattern = (region: number, ink = '#fff', alpha = 0.22): string => {
  const shape = PATTERN_SHAPES[region]
  if (!shape) return 'none'
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'><g fill='${ink}' stroke='${ink}' opacity='${alpha}'>${shape}</g></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

/** The board's patterns: white, at 22%, over each region's colour. */
export const REGION_PATTERNS = REGION_COLORS.map((_, region) => regionPattern(region))
