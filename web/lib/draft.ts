// The working draft: what is in the form right now. It holds text, not numbers, because a box
// that is half typed ("1,2") is not a number yet. Nothing here touches the network or storage.

import type { ScenarioInput } from './api'
import { parseAmount } from './format'

export interface DebtDraft {
  id: string
  name: string
  balance: string
  apr: string
  minimumPayment: string
}

export interface OneOffDraft {
  id: string
  month: number
  amount: string
}

export interface Draft {
  debts: DebtDraft[]
  savings: string
  emergencyFundGoal: string
  monthlyBudget: string
  extraPerMonth: number
  oneOffPayments: OneOffDraft[]
}

export const MAX_DEBTS = 20
export const MAX_ONE_OFFS = 24
export const MAX_EXTRA_PER_MONTH = 1000

let nextId = 0
export function newId(): string {
  nextId += 1
  return `${Date.now().toString(36)}-${nextId}`
}

export function blankDebt(): DebtDraft {
  return { id: newId(), name: '', balance: '', apr: '', minimumPayment: '' }
}

export function blankDraft(): Draft {
  return { debts: [blankDebt()], savings: '', emergencyFundGoal: '', monthlyBudget: '', extraPerMonth: 0, oneOffPayments: [] }
}

const text = (value: number | null) => (value === null ? '' : String(value))

/** Fills the form from a scenario: an example, or someone's shared plan. */
export function fromInput(input: ScenarioInput): Draft {
  return {
    debts: input.debts.map((d) => ({ id: newId(), name: d.name ?? '', balance: text(d.balance), apr: text(d.apr), minimumPayment: text(d.minimumPayment) })),
    savings: text(input.savings),
    emergencyFundGoal: text(input.emergencyFundGoal),
    monthlyBudget: text(input.monthlyBudget),
    extraPerMonth: input.extraPerMonth ?? 0,
    oneOffPayments: input.oneOffPayments.map((p) => ({ id: newId(), month: p.month ?? 1, amount: text(p.amount) })),
  }
}

const isBlank = (debt: DebtDraft) => [debt.name, debt.balance, debt.apr, debt.minimumPayment].every((value) => value.trim() === '')

export const NOT_A_NUMBER = 'Enter a number, such as 1,250.50.'

export interface Request {
  /** What to send to the API, or null when there is nothing worth sending yet. */
  input: ScenarioInput | null
  /** Problems found before sending, keyed by form field: "debt.<id>.balance", "savings". */
  errors: Record<string, string>
  /** Turns an API field path ("debts[0].balance") into a form field key. */
  fieldFor: (path: string) => string
}

/**
 * Turns the draft into a request. Debt rows left completely empty are skipped, so adding a row
 * does not light up four errors before anything has been typed. Text that is not a number is
 * reported here; a missing value is left for the API to explain.
 */
export function toRequest(draft: Draft): Request {
  const errors: Record<string, string> = {}
  const number = (value: string, field: string): number | null => {
    const parsed = parseAmount(value)
    if (parsed !== null && Number.isNaN(parsed)) {
      errors[field] = NOT_A_NUMBER
      return null
    }
    return parsed
  }

  const debts = draft.debts.filter((debt) => !isBlank(debt))
  const oneOffs = draft.oneOffPayments
  const input: ScenarioInput = {
    debts: debts.map((d) => ({
      name: d.name,
      balance: number(d.balance, `debt.${d.id}.balance`),
      apr: number(d.apr, `debt.${d.id}.apr`),
      minimumPayment: number(d.minimumPayment, `debt.${d.id}.minimumPayment`),
    })),
    savings: number(draft.savings, 'savings'),
    emergencyFundGoal: number(draft.emergencyFundGoal, 'emergencyFundGoal'),
    monthlyBudget: number(draft.monthlyBudget, 'monthlyBudget'),
    extraPerMonth: draft.extraPerMonth,
    oneOffPayments: oneOffs.map((p) => ({ month: p.month, amount: number(p.amount, `oneOff.${p.id}.amount`) })),
  }

  const fieldFor = (path: string): string => {
    const debt = /^debts\[(\d+)\]\.(\w+)$/.exec(path)
    if (debt) return `debt.${debts[Number(debt[1])]?.id}.${debt[2]}`
    const oneOff = /^oneOffPayments\[(\d+)\]\.(\w+)$/.exec(path)
    if (oneOff) return `oneOff.${oneOffs[Number(oneOff[1])]?.id}.${oneOff[2]}`
    return path
  }

  const nothingYet = debts.length === 0 && [draft.savings, draft.emergencyFundGoal, draft.monthlyBudget].every((value) => value.trim() === '')
  return { input: nothingYet || Object.keys(errors).length > 0 ? null : input, errors, fieldFor }
}

export interface Totals {
  debtCount: number
  totalDebt: number
  totalMinimums: number
  /** The monthly amount plus the what-if extra. */
  budget: number
  /** What is left for the strategy to direct once every minimum is paid. Negative if short. */
  extra: number
  /** True once a monthly amount has been typed. */
  hasBudget: boolean
}

/** The running totals shown beside the inputs. Boxes that are empty or not numbers count as 0. */
export function totals(draft: Draft): Totals {
  const value = (textValue: string) => {
    const parsed = parseAmount(textValue)
    return parsed === null || Number.isNaN(parsed) ? 0 : parsed
  }
  const cents = (amount: number) => Math.round(amount * 100) / 100
  const debts = draft.debts.filter((debt) => !isBlank(debt))
  const totalDebt = cents(debts.reduce((sum, d) => sum + value(d.balance), 0))
  const totalMinimums = cents(debts.reduce((sum, d) => sum + (value(d.balance) > 0 ? value(d.minimumPayment) : 0), 0))
  const budget = cents(value(draft.monthlyBudget) + draft.extraPerMonth)
  return { debtCount: debts.length, totalDebt, totalMinimums, budget, extra: cents(budget - totalMinimums), hasBudget: draft.monthlyBudget.trim() !== '' }
}

/** A draft read back from storage, or null if it is missing or not one of ours. */
export function parseDraft(raw: string | null | undefined): Draft | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<Draft>
    if (!Array.isArray(value.debts) || !Array.isArray(value.oneOffPayments)) return null
    if (typeof value.savings !== 'string' || typeof value.emergencyFundGoal !== 'string' || typeof value.monthlyBudget !== 'string') return null
    return {
      debts: value.debts.slice(0, MAX_DEBTS),
      savings: value.savings,
      emergencyFundGoal: value.emergencyFundGoal,
      monthlyBudget: value.monthlyBudget,
      extraPerMonth: typeof value.extraPerMonth === 'number' ? value.extraPerMonth : 0,
      oneOffPayments: value.oneOffPayments.slice(0, MAX_ONE_OFFS),
    }
  } catch {
    return null
  }
}
