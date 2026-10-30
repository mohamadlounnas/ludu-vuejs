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
 * halo in a contrasting colour so it reads on every region colour.
 */
export const INKS = [
  { color: '#ffffff', halo: '' },
  { color: '#22305c', halo: '#ffffff' }, // navy
  { color: '#ffd60a', halo: '#4a3300' }, // yellow
  { color: '#ff2e88', halo: '#ffffff' }, // hot pink
]
