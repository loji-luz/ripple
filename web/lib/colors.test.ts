import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { colors as c } from './colors'
import { contrast } from './contrast'

// Every text and background pair the app uses. WCAG 2.1 AA asks for 4.5:1 for text and 3:1
// for large text and for the shapes that mark out a control or carry meaning in a chart.
const text: [string, string, string][] = [
  ['ink on paper', c.ink, c.paper],
  ['ink on canvas', c.ink, c.canvas],
  ['ink on tint (table header)', c.ink, c.tint],
  ['ink on warning (yellow badge)', c.ink, c.warning],
  ['ink on warning tint (estimate notice)', c.ink, c.warningTint],
  ['ink on info tint', c.ink, c.infoTint],
  ['ink on success tint', c.ink, c.successTint],
  ['slate on success tint (recommended row)', c.slate, c.successTint],
  ['ink on error tint', c.ink, c.errorTint],
  ['slate on paper (secondary text, secondary buttons)', c.slate, c.paper],
  ['slate on canvas', c.slate, c.canvas],
  ['slate on tint (secondary button hover)', c.slate, c.tint],
  ['slate on warning tint', c.slate, c.warningTint],
  ['slate on info tint (hovered table row)', c.slate, c.infoTint],
  ['paper on slate (neutral badge, pressed button, primary hover)', c.paper, c.slate],
  ['paper on ink (header, primary button)', c.paper, c.ink],
  ['warning on ink (header accent)', c.warning, c.ink],
  ['paper on success (Recommended badge)', c.paper, c.success],
  ['paper on error (error badge)', c.paper, c.error],
  ['paper on info', c.paper, c.info],
  ['info on paper (links)', c.info, c.paper],
  ['info on canvas', c.info, c.canvas],
  ['info on info tint', c.info, c.infoTint],
  ['error on paper (field errors)', c.error, c.paper],
  ['error on error tint', c.error, c.errorTint],
  ['success on paper', c.success, c.paper],
]

const shapes: [string, string, string][] = [
  ['slate on paper (input and table borders)', c.slate, c.paper],
  ['slate on canvas (borders)', c.slate, c.canvas],
  ['info on paper (focus ring)', c.info, c.paper],
  ['info on canvas (focus ring)', c.info, c.canvas],
  ['warning on ink (focus ring in the header)', c.warning, c.ink],
  ['highest interest first line on paper', c.seriesAvalanche, c.paper],
  ['smallest debt first line on paper', c.seriesSnowball, c.paper],
  ['half and half line on paper', c.seriesHalf, c.paper],
]

describe('colour contrast', () => {
  it.each(text)('%s meets 4.5:1', (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(shapes)('%s meets 3:1', (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3)
  })

  it('shows why white text is never put on the warning yellow', () => {
    expect(contrast(c.paper, c.warning)).toBeLessThan(3)
  })

  it('prints the measured ratios', () => {
    const lines = [...text, ...shapes].map(([name, fg, bg]) => `${contrast(fg, bg).toFixed(2).padStart(6)}  ${name}`)
    console.log(lines.join('\n'))
  })
})

describe('the stylesheet', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
  const kebab = (name: string) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)

  it.each(Object.entries(c))('declares --color-%s as %s', (name, hex) => {
    const declared = new RegExp(`--color-${kebab(name)}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1]
    expect(declared?.toUpperCase()).toBe(hex.toUpperCase())
  })

  it('uses no colour outside the palette', () => {
    const palette = new Set(Object.values(c).map((hex) => hex.toUpperCase()))
    const used = [...css.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toUpperCase())
    expect(used.filter((hex) => !palette.has(hex))).toEqual([])
  })
})
