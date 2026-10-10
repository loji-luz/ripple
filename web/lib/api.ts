// The web app's view of the API. These types mirror api/src/Ripple.Api/Contracts.cs.
// All money is US dollars. Month 1 is the first month of the plan.

export interface DebtInput {
  name: string | null
  balance: number | null
  apr: number | null
  minimumPayment: number | null
}

export interface OneOffInput {
  month: number | null
  amount: number | null
}

export interface ScenarioInput {
  debts: DebtInput[]
  savings: number | null
  emergencyFundGoal: number | null
  monthlyBudget: number | null
  extraPerMonth: number | null
  oneOffPayments: OneOffInput[]
}

export type StrategyId = 'HighestInterestFirst' | 'SmallestDebtFirst' | 'HalfAndHalf'

export interface Month {
  month: number
  interest: number
  debtPayment: number
  savingsContribution: number
  debtBalance: number
  savingsBalance: number
}

export interface StrategyResult {
  strategy: StrategyId
  label: string
  recommended: boolean
  debtFreeMonth: number
  fundReachedMonth: number
  totalInterest: number
  totalPaidToDebt: number
  payoffs: { name: string; month: number }[]
  months: Month[]
}

/** The answer when the payment does not clear the debt within fifty years. */
export interface Stalled {
  /** Interest added in the first month. */
  monthlyInterest: number
  /** True when the debt does come down, only too slowly to finish. */
  shrinking: boolean
  /** The smallest whole-dollar monthly amount that clears the debt at all. */
  budgetToClear: number
  /** The smallest whole-dollar monthly amount that clears it in 60 months. */
  budgetForFiveYears: number
  /** Total debt at the end of each of the next 60 months at the current payment. */
  balances: number[]
}

export interface Simulation {
  engineVersion: string
  totalDebt: number
  totalMinimums: number
  budget: number
  recommendation: { strategy: StrategyId; label: string; reason: 'LowestInterest' | 'BuildsCushionFirst' | 'NoDifference'; sentence: string }
  strategies: StrategyResult[]
  /** Set, with no strategies, when the payment does not clear the debt. */
  stalled?: Stalled | null
}

export interface SavedScenario {
  code: string
  input: ScenarioInput
  engineVersion: string
  createdAt: string
}

export interface ReferenceRate {
  seriesId: string
  label: string
  value: number
  unit: string
  observedDate: string
  retrievedAt: string
  source: string
  sourceUrl: string
}

export interface Example {
  slug: string
  title: string
  summary: string
  source: string
  illustrative: boolean
  input: ScenarioInput
}

/**
 * A refused request. `fields` holds one message per field when the input was the problem,
 * keyed by its path in the request ("debts[0].balance"). `code` names an engine error such as
 * "BudgetBelowMinimums". `retryAfter` is in seconds, on a 429.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields: Record<string, string> = {},
    public code: string | null = null,
    public retryAfter: number | null = null,
  ) {
    super(message)
  }
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ApiError(0, "Can't reach Ripple right now. Check your connection and try again.")
  }
  if (response.ok) return (await response.json()) as T

  const problem = await response.json().catch(() => null)
  const fields: Record<string, string> = {}
  for (const [key, messages] of Object.entries((problem?.errors ?? {}) as Record<string, string[]>)) fields[key] = messages[0]

  if (response.status === 429) {
    const seconds = Number(response.headers.get('Retry-After')) || 60
    throw new ApiError(429, `Too many changes at once. Ripple will try again in ${seconds} seconds.`, {}, null, seconds)
  }
  const message =
    Object.values(fields)[0] ??
    problem?.detail ??
    (response.status >= 500 ? 'Ripple had a problem working that out. Try again in a moment.' : (problem?.title ?? 'Something went wrong. Try again.'))
  throw new ApiError(response.status, message, fields, problem?.code ?? null)
}

export const api = {
  simulate: (input: ScenarioInput, signal?: AbortSignal) => request<Simulation>('POST', '/simulations', input, signal),
  share: (input: ScenarioInput) => request<{ code: string }>('POST', '/scenarios', input),
  scenario: (code: string) => request<SavedScenario>('GET', `/scenarios/${encodeURIComponent(code)}`),
  referenceRates: () => request<ReferenceRate[]>('GET', '/reference-rates'),
  examples: () => request<Example[]>('GET', '/examples'),
}
