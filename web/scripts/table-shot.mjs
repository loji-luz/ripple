// The month-by-month table with every month showing, scrolled part of the way down.
//   node scripts/table-shot.mjs <out-dir>
import { chromium } from '@playwright/test'
const out = process.argv[2] ?? '.'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:3300')
await page.getByRole('button', { name: /Use this example: A card and a smaller personal loan/ }).click()
await page.getByTestId('recommendation').waitFor()
await page.getByRole('button', { name: 'Table', exact: true }).click()
await page.getByRole('button', { name: 'Next rows' }).click()
await page.getByRole('region', { name: 'Remaining debt at the end of each month' }).evaluate((el) => (el.scrollTop = 0))
await page.waitForTimeout(300)
await page.screenshot({ path: `${out}/ripple-table.png` })
await browser.close()
