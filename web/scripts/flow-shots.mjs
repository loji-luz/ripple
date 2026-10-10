// Full-page screenshots of the two steps of the planner, at desktop and phone widths.
//   node scripts/flow-shots.mjs <out-dir>
import { chromium } from '@playwright/test'

const out = process.argv[2] ?? '.'
const browser = await chromium.launch()
for (const [name, viewport] of [
  ['desktop', { width: 1440, height: 900 }],
  ['phone', { width: 390, height: 844 }],
]) {
  const page = await browser.newPage({ viewport })
  await page.goto('http://localhost:3300')
  await page.getByRole('button', { name: /Use this example: A card and a smaller personal loan/ }).click()
  await page.getByTestId('recommendation').waitFor()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${out}/ripple-${name}-comparison.png`, fullPage: true })
  await page.getByLabel('Extra per month', { exact: true }).fill('200')
  await page.getByRole('button', { name: 'About Highest interest first' }).focus()
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${out}/ripple-${name}-tooltip.png` })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '1 Your numbers' }).click()
  await page.getByRole('heading', { name: 'Your numbers' }).waitFor()
  await page.screenshot({ path: `${out}/ripple-${name}-numbers.png`, fullPage: true })
  await page.close()
}
await browser.close()
