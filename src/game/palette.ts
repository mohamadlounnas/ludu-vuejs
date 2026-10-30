/** Region colors sampled from the reference screenshot, in the order of the cat-head strip. */
export const REGION_COLORS = [
  '#cb7571', // rose
  '#f1ac6f', // orange
  '#e1bd5b', // mustard
  '#b6d899', // green
  '#66b2ae', // teal
  '#7cb7df', // blue
  '#a9bbd8', // slate
  '#947fd0', // purple
  '#df8ab4', // pink
  '#efb5cf', // light pink
  '#c9a27e', // tan (11×11 boards only)
]

export const pastel = (color: string) => `color-mix(in srgb, ${color} 50%, white)`
