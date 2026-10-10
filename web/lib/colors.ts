// Every colour the app uses. app/globals.css declares the same values as Tailwind tokens
// (--color-ink and so on), and colors.test.ts fails if the two drift apart or if a text and
// background pair drops below WCAG 2.1 AA.

export const colors = {
  // Brand: the header, primary buttons, headings and body text.
  ink: '#181D27',
  // Secondary: secondary text, secondary buttons, the neutral badge, and the borders that mark
  // out a control or a table (3:1 against the surface is needed there; it has far more).
  slate: '#4E5E7E',
  // Surfaces.
  paper: '#FFFFFF',
  canvas: '#F3F4F6',
  // Table header rows and quiet fills.
  tint: '#E5E8EE',
  // Dividers inside a panel. Decorative, so no contrast requirement.
  line: '#CDD2DB',

  // Status. Always shown with a text label, never as colour alone.
  success: '#3A7D44',
  successTint: '#E7F2E9',
  error: '#A10702',
  errorTint: '#FBEAE9',
  // Yellow carries dark text. White on it is unreadable and is never used.
  warning: '#F4D35E',
  warningTint: '#FDF6DC',
  // Links, focus rings and the slider.
  info: '#24579E',
  infoTint: '#E8F0FA',

  // One colour per strategy in the chart. Each line also has its own dash pattern.
  seriesAvalanche: '#0A7CA8',
  seriesSnowball: '#B4530A',
  seriesHalf: '#7A3E9D',
} as const

export type ColorName = keyof typeof colors
