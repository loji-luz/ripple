import { describe, expect, it } from 'vitest'
import type { ScenarioInput, StrategyResult } from './api'
import { blankDebt, blankDraft, type Draft, fromInput, NOT_A_NUMBER, parseDraft, toRequest, totals } from './draft'
import { balanceAt, monthTicks, niceScale, samePlan } from './strategies'

const input: ScenarioInput = {
  debts: [
    { name: 'Credit card', balance: 2200, apr: 22, minimumPayment: 55 },
    { name: 'Student loan', balance: 20000, apr: 5.5, minimumPayment: 330 },
  ],
  savings: 5300,
  emergencyFundGoal: 8000,
  monthlyBudget: 600,
  extraPerMonth: 0,
  oneOffPayments: [{ month: 3, amount: 500 }],
}

describe('the draft', () => {
  it('survives the trip from a scenario to the form and back', () => {
    const request = toRequest(fromInput(input))
    expect(request.errors).toEqual({})
    expect(request.input).toEqual(input)
  })

  it('reads amounts the way people type them', () => {
    const draft: Draft = { ...fromInput(input), monthlyBudget: '$1,250.50', savings: ' 5,300 ' }
    expect(toRequest(draft).input).toMatchObject({ monthlyBudget: 1250.5, savings: 5300 })
  })

  it('sends nothing while the form is empty', () => {
    expect(toRequest(blankDraft())).toMatchObject({ input: null, errors: {} })
  })

  it('skips debt rows that are completely empty, and keeps half-filled ones', () => {
    const draft = fromInput(input)
    const half = { ...blankDebt(), name: 'Car loan' }
    const request = toRequest({ ...draft, debts: [draft.debts[0], blankDebt(), half] })
    expect(request.input?.debts).toEqual([input.debts[0], { name: 'Car loan', balance: null, apr: null, minimumPayment: null }])
    // The API numbers debts as it received them: the half-filled row is debts[1] there.
    expect(request.fieldFor('debts[1].balance')).toBe(`debt.${half.id}.balance`)
    expect(request.fieldFor('monthlyBudget')).toBe('monthlyBudget')
  })

  it('reports text that is not a number beside its own field, and sends nothing', () => {
    const draft = fromInput(input)
    const request = toRequest({ ...draft, monthlyBudget: 'lots', debts: [{ ...draft.debts[0], apr: '-3' }, draft.debts[1]] })
    expect(request.input).toBeNull()
    expect(request.errors).toEqual({ monthlyBudget: NOT_A_NUMBER, [`debt.${draft.debts[0].id}.apr`]: NOT_A_NUMBER })
  })

  it('maps one-off payment errors back to their rows', () => {
    const draft = fromInput(input)
    expect(toRequest(draft).fieldFor('oneOffPayments[0].amount')).toBe(`oneOff.${draft.oneOffPayments[0].id}.amount`)
  })
})

describe('running totals', () => {
  it('adds up the debts, the minimums and what is left over', () => {
    expect(totals(fromInput(input))).toEqual({ debtCount: 2, totalDebt: 22200, totalMinimums: 385, budget: 600, extra: 215, hasBudget: true })
  })

  it('includes the what-if extra in the budget', () => {
    expect(totals({ ...fromInput(input), extraPerMonth: 50 })).toMatchObject({ budget: 650, extra: 265 })
  })

  it('goes negative when the budget is short of the minimums', () => {
    expect(totals({ ...fromInput(input), monthlyBudget: '300' })).toMatchObject({ extra: -85 })
  })

  it('treats empty and unreadable boxes as zero and avoids float noise', () => {
    const draft = fromInput(input)
    const debts = [
      { ...draft.debts[0], balance: '0.10', minimumPayment: '0.10' },
      { ...draft.debts[1], balance: '0.20', minimumPayment: 'abc' },
      blankDebt(),
    ]
    expect(totals({ ...draft, debts, monthlyBudget: '' })).toEqual({ debtCount: 2, totalDebt: 0.3, totalMinimums: 0.1, budget: 0, extra: -0.1, hasBudget: false })
  })
})

describe('reading a stored draft', () => {
  it('reads back what was saved', () => {
    const draft = fromInput(input)
    expect(parseDraft(JSON.stringify(draft))).toEqual(draft)
  })

  it('ignores anything that is not a draft', () => {
    for (const raw of [null, undefined, '', 'not json', '{}', '{"debts":"x"}', JSON.stringify({ debts: [], oneOffPayments: [], savings: 1 })]) expect(parseDraft(raw)).toBeNull()
  })
})

describe('chart helpers', () => {
  const strategy = (debtFreeMonth: number, balances: number[], totalInterest = 10): StrategyResult => ({
    strategy: 'HighestInterestFirst',
    label: 'Highest interest first',
    recommended: false,
    debtFreeMonth,
    fundReachedMonth: balances.length,
    totalInterest,
    totalPaidToDebt: 0,
    payoffs: [],
    months: balances.map((debtBalance, i) => ({ month: i + 1, interest: 0, debtPayment: 0, savingsContribution: 0, debtBalance, savingsBalance: 0 })),
  })

  it('reads the remaining debt for any month, including today and after the last payment', () => {
    const s = strategy(3, [700, 300, 0, 0])
    expect([0, 1, 2, 3, 4, 9].map((month) => balanceAt(s, month, 1000))).toEqual([1000, 700, 300, 0, 0, 0])
  })

  it('spots two strategies that are the same plan', () => {
    expect(samePlan(strategy(3, [700, 300, 0]), strategy(3, [700, 300, 0]))).toBe(true)
    expect(samePlan(strategy(3, [700, 300, 0]), strategy(3, [700, 310, 0]))).toBe(false)
    expect(samePlan(strategy(3, [700, 300, 0]), strategy(3, [700, 300, 0], 11))).toBe(false)
  })

  it('picks round numbers for the dollar axis', () => {
    expect(niceScale(22200)).toEqual({ top: 25000, step: 5000 })
    expect(niceScale(1000)).toEqual({ top: 1000, step: 200 })
    expect(niceScale(5600)).toEqual({ top: 6000, step: 2000 })
    expect(niceScale(0)).toEqual({ top: 1, step: 1 })
  })

  it('spaces the month labels a whole number of months apart', () => {
    expect(monthTicks(6, 7)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(monthTicks(70, 7)).toEqual([0, 12, 24, 36, 48, 60])
    expect(monthTicks(70, 4)).toEqual([0, 24, 48])
    expect(monthTicks(600, 4).length).toBeLessThanOrEqual(6)
  })
})
