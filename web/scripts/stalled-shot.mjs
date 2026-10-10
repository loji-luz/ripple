// The comparison when the payment does not clear the debt.
//   node scripts/stalled-shot.mjs <out-dir>
import { chromium } from '@playwright/test'

const out = process.argv[2] ?? '.'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:3300')
await page.getByRole('button', { name: 'Start with my own numbers' }).click()
await page.getByLabel('Name of debt 1').fill('test')
await page.getByLabel('Balance of test (USD)').fill('50000')
await page.getByLabel('APR of test (% a year)').fill('19.9')
await page.getByLabel('Minimum payment of test (USD a month)').fill('500')
await page.getByLabel('Current savings (USD)').fill('5000')
await page.getByLabel('Emergency fund goal (USD)').fill('0')
await page.getByLabel('Monthly amount for debt and savings together (USD)').fill('700')
await page.getByRole('button', { name: 'Compare the strategies' }).click()
await page.getByTestId('stalled').waitFor()
await page.waitForTimeout(600)
await page.screenshot({ path: `${out}/ripple-stalled.png`, fullPage: true })
await browser.close()
