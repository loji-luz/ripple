// The screenshots used in the README. Needs the database, the API and the web app running.
//   node scripts/readme-shots.mjs            (saves to ../docs/screenshots)
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const out = process.argv[2] ?? '../docs/screenshots'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch()
const BUDGET = 'Monthly amount for debt and savings together (USD)'
const fresh = async (viewport = { width: 1440, height: 900 }) => (await browser.newContext({ viewport, deviceScaleFactor: 1 })).newPage()
const settle = (page) => page.waitForTimeout(700)

// 1. The first screen: example households to start from.
let page = await fresh()
await page.goto('http://localhost:3300')
await page.getByRole('button', { name: /Use this example/ }).first().waitFor()
await settle(page)
await page.screenshot({ path: `${out}/start.png` })

// 2. The comparison for an example, with some extra each month.
await page.getByRole('button', { name: /Use this example: A card and a smaller personal loan/ }).click()
await page.getByTestId('recommendation').waitFor()
await page.getByRole('button', { name: 'Dismiss' }).click()
await page.getByLabel('Extra per month', { exact: true }).fill('150')
await page.getByTestId('extra-impact').getByText(/sooner/).waitFor()
await settle(page)
await page.screenshot({ path: `${out}/comparison.png` })

// 3. The same numbers as a table.
await page.getByRole('button', { name: 'Table', exact: true }).click()
await settle(page)
await page.screenshot({ path: `${out}/table.png` })

// 4. The form, with a definition open.
await page.getByRole('button', { name: '1 Your numbers' }).click()
await page.getByRole('heading', { name: 'Your numbers' }).waitFor()
await page.getByRole('button', { name: 'About APR' }).first().focus()
await settle(page)
await page.screenshot({ path: `${out}/numbers.png` })
await page.context().close()

// 5. A payment that does not clear the debt: an answer, not an error.
page = await fresh()
await page.goto('http://localhost:3300')
await page.getByRole('button', { name: 'Start with my own numbers' }).click()
await page.getByLabel('Name of debt 1').fill('Card')
await page.getByLabel('Balance of Card (USD)').fill('50000')
await page.getByLabel('APR of Card (% a year)').fill('19.9')
await page.getByLabel('Minimum payment of Card (USD a month)').fill('500')
await page.getByLabel('Current savings (USD)').fill('5000')
await page.getByLabel('Emergency fund goal (USD)').fill('0')
await page.getByLabel(BUDGET).fill('700')
await page.getByRole('button', { name: 'Compare the strategies' }).click()
await page.getByTestId('stalled').waitFor()
await settle(page)
await page.screenshot({ path: `${out}/debt-grows.png` })
await page.context().close()

// 6. On a phone.
page = await fresh({ width: 390, height: 844 })
await page.goto('http://localhost:3300')
await page.getByRole('button', { name: /Use this example: A card and a smaller personal loan/ }).click()
await page.getByTestId('recommendation').waitFor()
await page.getByRole('button', { name: 'Dismiss' }).click()
await settle(page)
await page.screenshot({ path: `${out}/phone.png` })
await browser.close()
console.log('saved to', out)
