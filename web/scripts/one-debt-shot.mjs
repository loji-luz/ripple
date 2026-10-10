// The comparison for one debt and a full emergency fund, where every strategy is the same plan.
//   node scripts/one-debt-shot.mjs <out-dir>
import { chromium } from '@playwright/test'

const out = process.argv[2] ?? '.'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:3300')
await page.getByRole('button', { name: 'Start with my own numbers' }).click()
await page.getByLabel('Name of debt 1').fill('test')
await page.getByLabel('Balance of test (USD)').fill('10000')
await page.getByLabel('APR of test (% a year)').fill('19.9')
await page.getByLabel('Minimum payment of test (USD a month)').fill('500')
await page.getByLabel('Current savings (USD)').fill('5000')
await page.getByLabel('Emergency fund goal (USD)').fill('0')
await page.getByLabel('Monthly amount for debt and savings together (USD)').fill('600')
await page.getByRole('button', { name: 'Compare the strategies' }).click()
await page.getByTestId('recommendation').waitFor()
await page.getByLabel('Extra per month', { exact: true }).fill('430')
await page.getByTestId('extra-impact').getByText(/sooner/).waitFor()
await page.waitForTimeout(500)
await page.screenshot({ path: `${out}/ripple-one-debt.png`, fullPage: true })
await browser.close()
