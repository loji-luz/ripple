// Walks the main path in a real browser and saves a screenshot of each screen, at desktop
// and phone widths.
//   node scripts/walkthrough.mjs <out-dir>
// Needs the database, the API (5195) and the web app (3300) running.
import { chromium } from '@playwright/test'

const out = process.argv[2] ?? '.'
const base = 'http://localhost:3300'
const browser = await chromium.launch()
const errors = []

for (const [name, viewport] of [
  ['desktop', { width: 1360, height: 900 }],
  ['phone', { width: 390, height: 844 }],
]) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  page.on('pageerror', (e) => errors.push(`${name}: ${e}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`))
  const shot = (step) => page.screenshot({ path: `${out}/ripple-${name}-${step}.png`, fullPage: true })

  await page.goto(base)
  await page.getByRole('button', { name: /Use this example: A card and a smaller personal loan/ }).waitFor()
  await shot('1-start')

  await page.getByRole('button', { name: /Use this example: A card and a smaller personal loan/ }).click()
  await page.getByTestId('recommendation').waitFor()
  if (name === 'phone') await page.getByRole('button', { name: 'Chart' }).click()
  await page.waitForTimeout(400)
  await shot('2-planner')

  await page.getByLabel('Monthly amount for debt and savings together (USD)').fill('200')
  await page.getByText(/Your minimum payments add up to/).first().waitFor()
  await shot('3-below-minimums')
  await page.getByLabel('Monthly amount for debt and savings together (USD)').fill('450')

  await page.getByLabel('Extra per month').fill('150')
  await page.getByRole('button', { name: 'Add a one-off payment' }).click()
  await page.getByLabel('Amount of payment 1 (USD)').fill('1000')
  await page.getByRole('button', { name: 'Table' }).click()
  await page.getByTestId('balance-table').waitFor()
  await page.waitForTimeout(600)
  await shot('4-what-if-and-table')

  await page.getByRole('button', { name: 'Create share link' }).click()
  const link = await page.getByLabel('Share link').inputValue()
  await shot('5-shared-link')

  await page.goto(link)
  await page.getByRole('button', { name: 'Make a copy to edit' }).waitFor()
  await page.getByTestId('recommendation').waitFor()
  await page.waitForTimeout(400)
  await shot('6-shared-view')

  await page.goto(`${base}/s/zzzzzzzz`)
  await page.getByRole('heading', { name: 'This shared plan is not here' }).waitFor()
  await shot('7-not-found')
  await context.close()
}

console.log('errors:', errors.length ? errors.join(' | ') : 'none')
await browser.close()
