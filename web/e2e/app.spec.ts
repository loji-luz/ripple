import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// These drive the real app: database, API and web all running (see the README). Every test
// starts with empty storage, so each one opens on the example households. Each test runs twice:
// at 1360px (desktop) and at 390px (phone).

const EXAMPLE = /Use this example: A card and a smaller personal loan/
const BUDGET = 'Monthly amount for debt and savings together (USD)'

async function openExample(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: EXAMPLE }).click()
  await expect(page.getByTestId('recommendation')).toBeVisible()
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
}

async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

/** Opens a folded section of the comparison, if it is not open already. */
async function unfold(page: Page, title: string) {
  const button = page.getByRole('button', { name: title, exact: true })
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click()
}

const card = (page: Page, strategy: string) => page.getByTestId(`strategy-${strategy}`)

/** Step one: the form. */
async function toNumbers(page: Page) {
  await page.getByRole('button', { name: '1 Your numbers' }).click()
  await expect(page.getByRole('heading', { name: 'Your numbers' })).toBeVisible()
}

/** Step two: the results. */
async function toComparison(page: Page) {
  await page.getByRole('button', { name: 'Compare the strategies' }).click()
  await expect(page.getByTestId('recommendation')).toBeVisible()
}

test('the first screen offers example households, and choosing one shows the comparison', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: /pay off debt first, or build your emergency fund first/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Use this example/ })).toHaveCount(3)
  // Every example says where its numbers come from and which are assumptions.
  await expect(page.getByText(/2022 Survey of Consumer Finances\. The interest rates.*are assumptions, not survey data/)).toHaveCount(3)
  await expectAccessible(page)
  await expectNoSidewaysScroll(page)

  await page.getByRole('button', { name: EXAMPLE }).click()

  // One strategy is recommended: the card opens on it and says why in a sentence.
  await expect(page.getByRole('heading', { name: 'Recommended strategy' })).toBeVisible()
  await expect(page.getByTestId('recommendation')).toContainText(/[A-Z].+\./)
  await expect(page.getByTestId('recommendation')).toHaveCount(1)
  for (const strategy of ['HighestInterestFirst', 'SmallestDebtFirst', 'HalfAndHalf']) {
    await expect(card(page, strategy).getByTestId('debt-free')).toHaveText(/^[A-Z][a-z]+ 20\d\d$/)
    await expect(card(page, strategy).getByTestId('total-interest')).toHaveText(/^\$[\d,]+\.\d\d$/)
    await expect(card(page, strategy).getByTestId('fund-full')).toHaveText(/^[A-Z][a-z]+ 20\d\d$/)
  }
  // The notice and the assumptions sit with the results.
  const comparison = page.getByRole('region', { name: 'Your comparison' })
  await expect(comparison.getByText('This is an estimate, not financial advice.')).toBeVisible()
  // The chart leads; the detail is folded away until it is asked for.
  await expect(page.getByRole('img', { name: /Line chart of remaining debt by month/ })).toBeVisible()
  await expect(comparison.getByText('Savings earn no interest.')).toBeHidden()
  const pageHeight = () => page.evaluate(() => document.documentElement.scrollHeight)
  const before = await pageHeight()
  await unfold(page, 'What these numbers assume')
  await expect(comparison.getByText('Savings earn no interest.')).toBeVisible()
  // Beside the chart, the side column scrolls inside itself: opening a section adds no height.
  if (page.viewportSize()!.width >= 1024) expect(await pageHeight()).toBe(before)
  // The arrows step through the other two strategies and come back round.
  const recommendedCard = page.locator('[data-testid^="strategy-"]:visible')
  const first = await recommendedCard.getAttribute('data-testid')
  await page.getByRole('button', { name: 'Next strategy' }).click()
  await expect(page.getByRole('heading', { name: 'Another strategy' })).toBeVisible()
  await expect(recommendedCard).not.toHaveAttribute('data-testid', first!)
  await expect(recommendedCard).toHaveCount(1)
  await page.getByRole('button', { name: 'Next strategy' }).click()
  await page.getByRole('button', { name: 'Next strategy' }).click()
  await expect(page.getByRole('heading', { name: 'Recommended strategy' })).toBeVisible()
  await page.getByRole('button', { name: 'Previous strategy' }).click()
  await expect(page.getByRole('heading', { name: 'Another strategy' })).toBeVisible()
  // The chart picks out whichever strategy is on the card.
  const shownNow = (await recommendedCard.getAttribute('data-testid'))!.replace('strategy-', '')
  await expect(page.locator('polyline[data-picked="true"]')).toHaveAttribute('data-line', new RegExp(shownNow))
  await page.getByRole('button', { name: 'Next strategy' }).click()
  await expect(page.locator('polyline[data-picked="true"]')).toHaveAttribute('data-line', new RegExp(first!.replace('strategy-', '')))
  // The chart names what each axis measures.
  const chart = page.getByRole('img', { name: /Line chart of remaining debt by month/ })
  await expect(chart.getByText('Remaining debt (USD)')).toBeVisible()
  await expect(chart.getByText('Month', { exact: true })).toBeVisible()
  await expectAccessible(page)
  await expectNoSidewaysScroll(page)

  // The form is the other step of the same panel, and the keyboard goes there with it.
  await toNumbers(page)
  await expect(page.getByRole('heading', { name: 'Your numbers' })).toBeFocused()
  await expect(page.getByText('Do not enter account numbers or real lender names.')).toBeVisible()
  await expect(page.getByTestId('recommendation')).toHaveCount(0)
  await expectAccessible(page)
  await expectNoSidewaysScroll(page)
})

test('editing a debt updates the totals beside it and the comparison', async ({ page }) => {
  await openExample(page)
  const interest = card(page, 'HighestInterestFirst').getByTestId('total-interest')
  const before = await interest.textContent()

  await toNumbers(page)
  await expect(page.getByTestId('total-debt')).toHaveText('$5,600.00')
  await expect(page.getByTestId('budget-split')).toContainText('$290.00 covers the minimums and $160.00 is left')
  await page.getByLabel('Balance of Credit card (USD)').fill('5,000')
  await expect(page.getByTestId('total-debt')).toHaveText('$7,100.00')
  await page.getByLabel('Minimum payment of Credit card (USD a month)').fill('120')
  await expect(page.getByTestId('total-minimums')).toHaveText('$320.00')
  await expect(page.getByTestId('budget-split')).toContainText('$320.00 covers the minimums and $130.00 is left')

  await toComparison(page)
  await expect(interest).not.toHaveText(before!)
})

test('a monthly amount below the minimums shows the named error beside the field', async ({ page }) => {
  await openExample(page)
  await toNumbers(page)
  const budget = page.getByLabel(BUDGET)
  await budget.fill('200')

  await expect(budget).toHaveAttribute('aria-invalid', 'true')
  const describedBy = (await budget.getAttribute('aria-describedby'))!.split(' ')[0]
  await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(
    'Fix: Your minimum payments add up to $290.00 a month, but the monthly amount is $200.00. Raise it to at least $290.00, or check the minimums.',
  )
  await expect(page.getByTestId('budget-split')).toContainText('$90.00 short')
  // Compare does not move on while a box is wrong: it says how many, and goes to the first.
  await page.getByRole('button', { name: 'Compare the strategies' }).click()
  await expect(page.getByText('1 box needs a number before the strategies can be compared.')).toBeVisible()
  await expect(budget).toBeFocused()
  await expect(page.getByTestId('recommendation')).toHaveCount(0)
  await expectAccessible(page)
  await expectNoSidewaysScroll(page)

  // Text that is not a number is caught beside its field too.
  await budget.fill('lots')
  await expect(page.locator(`[id="${describedBy}"]`)).toHaveText('Fix: Enter a number, such as 1,250.50.')

  await budget.fill('450')
  await expect(budget).not.toHaveAttribute('aria-invalid', 'true')
  await toComparison(page)
})

test('the extra-per-month slider and a one-off payment change the dates', async ({ page }) => {
  await openExample(page)
  const debtFree = card(page, 'HighestInterestFirst').getByTestId('debt-free')
  const interest = card(page, 'HighestInterestFirst').getByTestId('total-interest')
  const [dateBefore, interestBefore] = [await debtFree.textContent(), await interest.textContent()]

  await page.getByLabel('Extra per month', { exact: true }).fill('300')
  await expect(page.getByTestId('extra-value')).toHaveText('$300.00 a month')
  // The slider says what the extra buys, against the same plan without it.
  await expect(page.getByTestId('extra-impact')).toHaveText(/^With \$300\.00 extra a month, you are debt-free \d.* sooner and pay \$[\d,]+\.\d\d less interest than without it\.$/)
  await expect(debtFree).not.toHaveText(dateBefore!)
  await expect(interest).not.toHaveText(interestBefore!)
  const interestWithExtra = await interest.textContent()

  await unfold(page, 'One-off extra payments')
  await page.getByRole('button', { name: 'Add a one-off payment' }).click()
  await page.getByLabel('Month of payment 1').selectOption('2')
  await page.getByLabel('Amount of payment 1 (USD)').fill('1000')
  await expect(interest).not.toHaveText(interestWithExtra!)
  await expectAccessible(page)

  // Back on the numbers, the total is not left unexplained: the sum shows the slider's extra,
  // and it can be taken off from here.
  await toNumbers(page)
  await expect(page.getByTestId('budget-sum')).toContainText('$450.00 monthly amount + $300.00 extra from the slider on your comparison = $750.00 a month.')
  await page.getByRole('button', { name: 'Remove the extra' }).click()
  await expect(page.getByTestId('budget-sum')).toHaveCount(0)
  await expect(page.getByTestId('budget-split')).toContainText('$450.00 a month: $290.00 covers the minimums and $160.00 is left')
})

test('a share link reopens the same scenario, and a copy of it can be edited', async ({ page }) => {
  await openExample(page)
  await page.getByLabel('Extra per month', { exact: true }).fill('150')
  await expect(page.getByTestId('extra-value')).toHaveText('$150.00 a month')
  await expect(page.getByRole('status').filter({ hasText: 'Updating' })).toHaveCount(0)
  const facts = async () => ({
    recommendation: await page.getByTestId('recommendation').textContent(),
    interest: await page.getByTestId('total-interest').allTextContents(),
    debtFree: await page.getByTestId('debt-free').allTextContents(),
    fund: await page.getByTestId('fund-full').allTextContents(),
  })
  await unfold(page, 'Share this plan')
  await expect(page.getByRole('button', { name: 'Create share link' })).toBeVisible()
  const original = await facts()

  await page.getByRole('button', { name: 'Create share link' }).click()
  const link = await page.getByLabel('Share link').inputValue()
  expect(link).toMatch(/\/s\/[2-9a-hjkmnp-z]{8}$/)

  // Someone else opens the link: a fresh browser with nothing stored.
  const visitor = await (await page.context().browser()!.newContext({ viewport: page.viewportSize()! })).newPage()
  await visitor.goto(link)
  await expect(visitor.getByRole('heading', { name: 'Shared plan' })).toBeVisible()
  await expect(visitor.getByText('Read only')).toBeVisible()
  await expect(visitor.getByTestId('recommendation')).toHaveText(original.recommendation!)
  expect(await visitor.getByTestId('total-interest').allTextContents()).toEqual(original.interest)
  expect(await visitor.getByTestId('debt-free').allTextContents()).toEqual(original.debtFree)
  expect(await visitor.getByTestId('fund-full').allTextContents()).toEqual(original.fund)
  const debts = visitor.getByRole('table', { name: 'Debts in this plan' })
  await expect(debts.getByRole('row', { name: /Credit card/ })).toContainText('$3,500.00')
  await expect(debts.getByRole('row', { name: /Personal loan/ })).toContainText('$2,100.00')
  await expect(visitor.getByText('$150.00 a month')).toBeVisible()
  await expect(visitor.getByRole('textbox')).toHaveCount(0)
  await expectAccessible(visitor)
  await expectNoSidewaysScroll(visitor)

  await visitor.getByRole('button', { name: 'Make a copy to edit' }).click()
  await expect(visitor).toHaveURL(/\/$/)
  await expect(visitor.getByLabel('Name of debt 1')).toHaveValue('Credit card')
  await expect(visitor.getByLabel('Balance of Credit card (USD)')).toHaveValue('3500')
  await toComparison(visitor)
  await expect(visitor.getByTestId('extra-value')).toHaveText('$150.00 a month')
  await expect(visitor.getByTestId('recommendation')).toHaveText(original.recommendation!)
  await visitor.context().close()
})

test('a link that does not exist says so and offers a way forward', async ({ page }) => {
  await page.goto('/s/zzzzzzzz')
  await expect(page.getByRole('heading', { name: 'This shared plan is not here' })).toBeVisible()
  await expect(page.getByText('Not found', { exact: true })).toBeVisible()
  await expectAccessible(page)
  await expectNoSidewaysScroll(page)
  await page.getByRole('link', { name: 'Start with an example' }).click()
  await expect(page.getByRole('button', { name: /Use this example/ })).toHaveCount(3)
})

test('the chart and the table carry the same numbers', async ({ page }) => {
  await openExample(page)
  const plot = page.getByTestId('chart-plot')
  await expect(plot).toBeVisible()
  await expect(page.getByRole('img', { name: /Line chart of remaining debt by month/ })).toBeVisible()
  await expectAccessible(page)
  await expectNoSidewaysScroll(page)

  // Where each line reaches zero, according to the chart.
  const strategies = ['HighestInterestFirst', 'SmallestDebtFirst', 'HalfAndHalf']
  const payoffMonths: Record<string, string> = {}
  for (const strategy of strategies) payoffMonths[strategy] = (await page.getByTestId(`payoff-${strategy}`).getAttribute('data-month'))!

  // What the chart reads out a third of the way along.
  const box = (await plot.boundingBox())!
  await plot.dispatchEvent('pointermove', { clientX: box.x + box.width / 3, clientY: box.y + box.height / 2, pointerType: 'mouse' })
  const readout = page.getByTestId('chart-readout')
  await expect(readout).toContainText('End of ')
  const read = (await readout.textContent())!
  const amounts = read.match(/\$[\d,]+\.\d\d/g)!
  expect(amounts).toHaveLength(3)
  const monthLabel = /End of ([A-Z][a-z]+) (\d{4})/.exec(read)!

  // The table is the other face of the chart, switched from the bar above it.
  await page.getByRole('button', { name: 'Table', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Table', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(plot).toHaveCount(0)
  const table = page.getByTestId('balance-table')
  // The table is paged: twelve rows to start with, and the footer says which.
  await expect(page.getByTestId('table-range')).toHaveText(/^Showing 1 to 12 of \d+$/)
  await expect(table.locator('tbody tr')).toHaveCount(12)
  await expect(page.getByRole('button', { name: 'Previous rows' })).toBeDisabled()
  await page.getByRole('button', { name: 'Next rows' }).click()
  await expect(page.getByTestId('table-range')).toHaveText(/^Showing 13 to \d+ of \d+$/)
  await expect(table.locator('tr[data-month="12"]')).toHaveCount(1)
  await page.getByLabel('Rows to show').selectOption('all')
  await expect(page.getByRole('button', { name: 'Next rows' })).toBeDisabled()
  await expect(table.locator('tr[data-month="0"]')).toHaveCount(1)
  await expectAccessible(page)
  await expectNoSidewaysScroll(page)

  // The table row for that month has the same three amounts.
  const row = table.getByRole('row', { name: new RegExp(`^${monthLabel[1].slice(0, 3)} ${monthLabel[2]}`) })
  expect(await row.getByRole('cell').allTextContents()).toEqual(amounts)

  // And each strategy first shows $0.00 in the month the chart put its dot.
  for (const strategy of strategies) {
    const month = Number(payoffMonths[strategy])
    await expect(table.locator(`tr[data-month="${month}"] td[data-strategy="${strategy}"]`)).toHaveText('$0.00')
    await expect(table.locator(`tr[data-month="${month - 1}"] td[data-strategy="${strategy}"]`)).not.toHaveText('$0.00')
  }
  // The table is a real table: a caption, column headers, and the unit in each header.
  await expect(table.locator('caption')).toHaveText('Remaining debt at the end of each month, in US dollars')
  await expect(table.getByRole('columnheader')).toHaveText(['Month', 'Highest interest first (USD)', 'Smallest debt first (USD)', '50/50 (USD)'])
})

test('the draft stays in this browser, and clearing or removing can be undone', async ({ page }) => {
  await openExample(page)
  await toNumbers(page)
  await page.getByLabel('Balance of Credit card (USD)').fill('4200')
  await expect(page.getByTestId('total-debt')).toHaveText('$6,300.00')

  await page.reload()
  await expect(page.getByLabel('Balance of Credit card (USD)')).toHaveValue('4200')

  await page.getByRole('button', { name: 'Remove Personal loan' }).click()
  await expect(page.getByTestId('total-debt')).toHaveText('$4,200.00')
  await expect(page.getByText('Removed Personal loan.')).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByTestId('total-debt')).toHaveText('$6,300.00')

  await page.getByRole('button', { name: 'Start over' }).click()
  await expect(page.getByRole('button', { name: /Use this example/ })).toHaveCount(3)
  await expect(page.getByText('Cleared your numbers.')).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByLabel('Balance of Credit card (USD)')).toHaveValue('4200')
})

test('starting from a blank form asks for nothing until something is typed', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start with my own numbers' }).click()
  await expect(page.getByRole('heading', { name: 'Your numbers' })).toBeVisible()
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0)
  await expectAccessible(page)
  await expectNoSidewaysScroll(page)

  // Pressing Compare with the form empty says what is needed and goes to the first box.
  await page.getByRole('button', { name: 'Compare the strategies' }).click()
  await expect(page.getByLabel('Name of debt 1')).toBeFocused()
  await expect(page.getByText('Enter a debt, your savings and a monthly amount before the strategies can be compared.')).toBeVisible()
  await expectAccessible(page)

  await page.getByLabel('Name of debt 1').fill('Card 1')
  await page.getByLabel('Balance of Card 1 (USD)').fill('1000')
  await page.getByLabel('APR of Card 1 (% a year)').fill('12')
  await page.getByLabel('Minimum payment of Card 1 (USD a month)').fill('25')
  await page.getByLabel('Current savings (USD)').fill('0')
  await page.getByLabel('Emergency fund goal (USD)').fill('500')
  await page.getByLabel(BUDGET).fill('300')
  await toComparison(page)

  // The debt worked by hand in the engine's tests: $22.48 of interest.
  await expect(card(page, 'HighestInterestFirst').getByTestId('total-interest')).toHaveText('$22.48')
  // Nothing saved and a small goal: the thin-cushion rule recommends 50/50, and says why.
  await expect(page.getByTestId('recommendation')).toContainText('50/50')
  await expect(page.getByTestId('recommendation')).toContainText(/your savings are under one month of your budget/i)
  await expect(card(page, 'HalfAndHalf').getByTestId('recommendation')).toHaveCount(1)
  // The two that pay the single debt the same way share one line, and the legend says so.
  await expect(page.getByRole('list', { name: 'Legend' }).getByRole('listitem')).toHaveCount(2)
  await expect(page.getByRole('list', { name: 'Legend' })).toContainText('Highest interest first and Smallest debt first: the same with these numbers')
  await expect(card(page, 'SmallestDebtFirst')).toContainText('Same result as Highest interest first')
})

test('definitions sit behind a "?" that opens on focus, hover and tap, and closes with Escape', async ({ page }) => {
  await openExample(page)

  // Each strategy explains itself on request instead of in a sentence under its name.
  const about = page.getByRole('button', { name: 'About Highest interest first' })
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await about.focus()
  const tip = page.getByRole('tooltip')
  await expect(tip).toHaveText('Every extra dollar goes to the debt with the highest APR.')
  await expect(about).toHaveAttribute('aria-expanded', 'true')
  // It fits inside the window, wherever its button is.
  const box = (await tip.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  await expectAccessible(page)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tooltip')).toHaveCount(0)

  await toNumbers(page)
  await page.getByRole('button', { name: 'About the emergency fund goal' }).click()
  await expect(page.getByRole('tooltip')).toContainText('Savings kept for surprises')
  // A tap elsewhere puts it away.
  await page.getByRole('heading', { name: 'Your numbers' }).click()
  await expect(page.getByRole('tooltip')).toHaveCount(0)
})

test('one debt and a full fund: the card says the strategies match, why, and what to change', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start with my own numbers' }).click()
  await page.getByLabel('Name of debt 1').fill('Card 1')
  await page.getByLabel('Balance of Card 1 (USD)').fill('10000')
  await page.getByLabel('APR of Card 1 (% a year)').fill('19.9')
  await page.getByLabel('Minimum payment of Card 1 (USD a month)').fill('500')
  await page.getByLabel('Current savings (USD)').fill('5000')
  await page.getByLabel('Emergency fund goal (USD)').fill('0')
  await page.getByLabel(BUDGET).fill('1030')
  await toComparison(page)

  const plan = page.getByTestId('recommendation')
  await expect(page.getByRole('heading', { name: 'Your plan' })).toBeVisible()
  await expect(plan).toContainText('All three strategies give the same plan')
  await expect(plan).toContainText('You entered one debt, so there is no order to choose.')
  await expect(plan).toContainText('Add your other debts')
  await expect(plan).toContainText('Set an emergency fund goal higher than your savings.')
  await expect(page.getByRole('button', { name: 'Next strategy' })).toBeHidden()
  // The figures are the ones worked by hand: 11 months and $995.41 of interest.
  await expect(card(page, 'HighestInterestFirst').getByTestId('total-interest')).toHaveText('$995.41')
  await expect(page.getByRole('list', { name: 'Legend' })).toHaveText('All 3 strategies: the same with these numbers')
  await expectAccessible(page)

  // The way back is on the card.
  await plan.getByRole('button', { name: 'Change your numbers' }).click()
  await expect(page.getByRole('heading', { name: 'Your numbers' })).toBeFocused()
})

test('a payment too small to clear the debt is an answer, not an error', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Start with my own numbers' }).click()
  await page.getByLabel('Name of debt 1').fill('Card')
  await page.getByLabel('Balance of Card (USD)').fill('10000')
  await page.getByLabel('APR of Card (% a year)').fill('24')
  await page.getByLabel('Minimum payment of Card (USD a month)').fill('100')
  await page.getByLabel('Current savings (USD)').fill('0')
  await page.getByLabel('Emergency fund goal (USD)').fill('0')
  const budget = page.getByLabel(BUDGET)
  await budget.fill('150')
  // Nothing is marked wrong: $150 may be all there is.
  await page.getByRole('button', { name: 'Compare the strategies' }).click()
  const card = page.getByTestId('stalled')
  await expect(card).toBeVisible()
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0)
  await expect(card.getByRole('heading', { name: 'At $150.00 a month, the debt grows' })).toBeVisible()
  // $10,000 at 24% a year is $200.00 of interest in the first month.
  await expect(card.getByTestId('stalled-interest')).toHaveText('$200.00 a month')
  const needed = Number((await card.getByTestId('stalled-five-years').textContent())!.replace(/[^\d.]/g, ''))
  expect(needed).toBeGreaterThan(200)
  // The chart shows where the balance goes, with no payoff dot, and the table has the numbers.
  await expect(page.getByRole('img', { name: /does not reach zero/ })).toBeVisible()
  await expect(page.locator('[data-testid^="payoff-"]')).toHaveCount(0)
  await expect(page.getByTestId('extra-impact')).toContainText('more a month to start clearing the debt')
  await page.getByRole('button', { name: 'Table', exact: true }).click()
  // Month 1: 10,000.00 + 200.00 - 150.00.
  await expect(page.getByTestId('balance-table').locator('tr[data-month="1"] td')).toHaveText('$10,050.00')
  await expectAccessible(page)
  await expectNoSidewaysScroll(page)

  // Paying what the card asks for gives a real plan, done within five years.
  await toNumbers(page)
  await budget.fill(String(needed))
  await toComparison(page)
  await expect(page.getByTestId('stalled')).toHaveCount(0)
})

test('the card rate is shown only when one has been imported', async ({ page, request }) => {
  const rates = await (await request.get('/api/reference-rates')).json()
  await openExample(page)
  await toNumbers(page)
  const note = page.getByTestId('card-rate')
  if (rates.length === 0) {
    // No rate imported, so no line at all: never a made-up figure.
    await expect(note).toHaveCount(0)
  } else {
    await expect(note).toContainText(`${rates[0].value}% a year`)
    await expect(note).toContainText('FRED')
  }
})

test('robots.txt keeps crawlers out of the API', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text()
  expect(robots).toContain('Disallow: /api/')
})
