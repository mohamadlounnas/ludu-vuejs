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
