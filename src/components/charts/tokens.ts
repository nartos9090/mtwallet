/**
 * Chart colors, from the validated reference palette (dataviz skill,
 * references/palette.md). Series 1/2 were validated against this app's
 * surfaces (#ffffff light, #0a0a0a dark): all six checks pass in both modes.
 * Dark values are their own steps, not an automatic flip.
 */
export interface ChartTokens {
  surface: string
  textPrimary: string
  textSecondary: string
  muted: string
  grid: string
  baseline: string
  /** Categorical slots in fixed order: 1 = blue, 2 = orange. */
  series: [string, string]
  /** De-emphasis for context series (e.g. the previous period). */
  context: string
  /** One-hue ramp, near-zero first (recedes toward the surface in each mode). */
  sequential: string[]
  deltaGood: string
  deltaBad: string
  /** Label ink inside the strong end of the sequential ramp. */
  onStrong: string
}

export const LIGHT: ChartTokens = {
  surface: '#ffffff',
  textPrimary: '#0b0b0b',
  textSecondary: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  baseline: '#c3c2b7',
  series: ['#2a78d6', '#eb6834'],
  context: '#898781',
  sequential: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'],
  deltaGood: '#006300',
  deltaBad: '#d03b3b',
  onStrong: '#ffffff',
}

export const DARK: ChartTokens = {
  surface: '#0a0a0a',
  textPrimary: '#f0efec',
  textSecondary: '#c3c2b7',
  muted: '#898781',
  grid: '#2c2c2a',
  baseline: '#383835',
  series: ['#3987e5', '#d95926'],
  context: '#898781',
  sequential: ['#184f95', '#1c5cab', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4'],
  deltaGood: '#0ca30c',
  deltaBad: '#d03b3b',
  onStrong: '#0b0b0b',
}
