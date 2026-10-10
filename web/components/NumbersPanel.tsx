'use client'

import { useState } from 'react'
import type { ReferenceRate } from '@/lib/api'
import { blankDebt, type DebtDraft, type Draft, MAX_DEBTS, MAX_EXTRA_PER_MONTH, MAX_ONE_OFFS, newId, type Totals } from '@/lib/draft'
import { monthName, monthShort, percent, usd } from '@/lib/format'
import { Hint } from './Hint'
import { AmountField, FieldError, Section } from './ui'

/**
 * Where the monthly amount goes: the minimums first, then what is left for the strategy. When
 * the comparison's slider has added an extra, the sum is written out, because the slider is on
 * the other step and the total would otherwise appear from nowhere.
 */
function BudgetSplit({ draft, totals, onClearExtra }: { draft: Draft; totals: Totals; onClearExtra: () => void }) {
  if (!totals.hasBudget) return null
  const extra = draft.extraPerMonth
  return (
    <div className="mt-2 text-[0.92rem]" data-testid="budget-split">
      {extra > 0 && (
        <p className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="budget-sum">
          <span>
            {usd(totals.budget - extra)} monthly amount + <strong className="font-bold">{usd(extra)} extra</strong> from the slider on your comparison ={' '}
            <strong className="font-bold">{usd(totals.budget)} a month</strong>.
          </span>
          <button type="button" className="link" onClick={onClearExtra}>
            Remove the extra
          </button>
        </p>
      )}
      <p>
        {totals.extra >= 0 ? (
          <>
            {extra > 0 ? 'Of that, ' : `${usd(totals.budget)} a month: `}
            <strong className="font-bold">{usd(totals.totalMinimums)}</strong> covers the minimums and <strong className="font-bold">{usd(totals.extra)}</strong> is left for the strategy to direct.
          </>
        ) : (
          <>
            {usd(totals.budget)} a month is <strong className="font-bold">{usd(-totals.extra)} short</strong> of the {usd(totals.totalMinimums)} in minimum payments.
          </>
        )}
      </p>
    </div>
  )
}

interface Props {
  draft: Draft
  totals: Totals
  /** Messages by form field key: "debt.<id>.balance", "monthlyBudget". */
  errors: Record<string, string>
  /** The first month of the plan. */
  start: Date
  /** The imported card rate, or null when none has been imported. Never a made-up figure. */
  cardRate: ReferenceRate | null
  onChange: (draft: Draft) => void
  /** A change worth an Undo: removing a debt or a one-off payment. */
  onReplace: (draft: Draft, message: string) => void
  /** True once Compare has been pressed with boxes missing: every problem is then shown. */
  showAllErrors?: boolean
}

/** Step one: the debts, the savings and the monthly amount. */
export function NumbersForm({ draft, totals, errors, cardRate, onChange, onReplace, showAllErrors }: Omit<Props, 'start'>) {
  // A box only shows a "missing" message once it has been visited, so a new row is not all red.
  const [visited, setVisited] = useState<Record<string, boolean>>({})
  const visit = (field: string) => setVisited((current) => (current[field] ? current : { ...current, [field]: true }))
  const errorFor = (field: string, value: string) => (value.trim() !== '' || visited[field] || showAllErrors ? errors[field] : undefined)

  const setDebt = (id: string, change: Partial<DebtDraft>) => onChange({ ...draft, debts: draft.debts.map((d) => (d.id === id ? { ...d, ...change } : d)) })

  return (
      <div className="flex flex-col gap-5">
        <Section title="Debts" first>
          <p id="privacy-note" className="mb-3 text-[0.92rem] text-slate">
            Use nicknames. Do not enter account numbers or real lender names.
          </p>
          <div className="table-frame">
            <table className="table debt-editor" role="table" aria-describedby="privacy-note">
              <caption className="sr-only">Your debts. Amounts are in US dollars.</caption>
              <thead role="rowgroup">
                <tr role="row">
                  <th role="columnheader" scope="col">
                    Name
                  </th>
                  <th role="columnheader" scope="col" className="num md:w-[11rem]">
                    Balance (USD) <Hint about="balance">What you owe on this debt today.</Hint>
                  </th>
                  <th role="columnheader" scope="col" className="num md:w-[9rem]">
                    APR (% a year) <Hint about="APR">Annual percentage rate: the interest charged on this debt over a year. It is printed on your statement.</Hint>
                  </th>
                  <th role="columnheader" scope="col" className="num md:w-[14rem]">
                    Minimum (USD a month) <Hint about="the minimum payment">The smallest payment the lender accepts each month.</Hint>
                  </th>
                  <th role="columnheader" scope="col" className="md:w-[3.6rem]">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {draft.debts.map((debt, index) => {
                  const key = `debt.${debt.id}`
                  const called = debt.name.trim() || `debt ${index + 1}`
                  const nameError = errorFor(`${key}.name`, debt.name)
                  return (
                    <tr role="row" key={debt.id}>
                      <td role="cell" className="cell-wide">
                        <label htmlFor={`${key}.name`} className="mb-1 block text-[0.92rem] md:sr-only">
                          Name <span className="sr-only">of debt {index + 1}</span>
                        </label>
                        <input
                          id={`${key}.name`}
                          className="field"
                          type="text"
                          maxLength={40}
                          autoComplete="off"
                          placeholder={`Card ${index + 1}`}
                          value={debt.name}
                          onChange={(event) => setDebt(debt.id, { name: event.target.value })}
                          onBlur={() => visit(`${key}.name`)}
                          aria-invalid={nameError ? true : undefined}
                          aria-describedby={nameError ? `${key}.name-error` : undefined}
                        />
                        <FieldError id={`${key}.name-error`} message={nameError} />
                      </td>
                      <td role="cell">
                        <AmountField
                          id={`${key}.balance`}
                          label={<>Balance <span className="sr-only">of {called}</span> (USD)</>}
                          unit="$"
                          value={debt.balance}
                          help={{ about: 'balance', text: 'What you owe on this debt today.' }}
                          onChange={(balance) => setDebt(debt.id, { balance })}
                          onBlur={() => visit(`${key}.balance`)}
                          error={errorFor(`${key}.balance`, debt.balance)}
                          labelHiddenWhenWide
                        />
                      </td>
                      <td role="cell">
                        <AmountField
                          id={`${key}.apr`}
                          label={<>APR <span className="sr-only">of {called}</span> (% a year)</>}
                          unit="%"
                          value={debt.apr}
                          help={{ about: 'APR', text: 'Annual percentage rate: the interest charged on this debt over a year. It is printed on your statement.' }}
                          onChange={(apr) => setDebt(debt.id, { apr })}
                          onBlur={() => visit(`${key}.apr`)}
                          error={errorFor(`${key}.apr`, debt.apr)}
                          labelHiddenWhenWide
                        />
                      </td>
                      <td role="cell">
                        <AmountField
                          id={`${key}.minimumPayment`}
                          label={<>Minimum <span className="sr-only">payment of {called}</span> (USD a month)</>}
                          unit="$"
                          value={debt.minimumPayment}
                          help={{ about: 'the minimum payment', text: 'The smallest payment the lender accepts each month.' }}
                          onChange={(minimumPayment) => setDebt(debt.id, { minimumPayment })}
                          onBlur={() => visit(`${key}.minimumPayment`)}
                          error={errorFor(`${key}.minimumPayment`, debt.minimumPayment)}
                          labelHiddenWhenWide
                        />
                      </td>
                      <td role="cell" className="max-md:self-end md:text-right">
                        <button
                          type="button"
                          className="button w-full px-0 md:w-11"
                          onClick={() => onReplace({ ...draft, debts: draft.debts.filter((d) => d.id !== debt.id) }, `Removed ${called}.`)}
                          disabled={draft.debts.length === 1}
                          aria-label={`Remove ${called}`}
                          title={draft.debts.length === 1 ? 'A plan needs at least one debt' : `Remove ${called}`}
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          </svg>
                          <span className="md:hidden">Remove</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot role="rowgroup">
                <tr role="row">
                  <th role="rowheader" scope="row" className="cell-desktop">
                    Total
                  </th>
                  <td role="cell" className="num" data-label="Total owed" data-testid="total-debt">
                    {usd(totals.totalDebt)}
                  </td>
                  <td role="cell" className="cell-desktop" />
                  <td role="cell" className="num" data-label="Minimums a month" data-testid="total-minimums">
                    {usd(totals.totalMinimums)}
                  </td>
                  <td role="cell" className="cell-desktop" />
                </tr>
              </tfoot>
            </table>
          </div>
          <FieldError id="debts-error" message={errors.debts} />

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button type="button" className="button" disabled={draft.debts.length >= MAX_DEBTS} onClick={() => onChange({ ...draft, debts: [...draft.debts, blankDebt()] })}>
              Add a debt
            </button>
            {draft.debts.length >= MAX_DEBTS && <p className="text-[0.92rem] text-slate">Ripple compares up to {MAX_DEBTS} debts.</p>}
          </div>

          {cardRate && (
            <p className="mt-3 text-[0.92rem] text-slate" data-testid="card-rate">
              Average US credit card rate: <strong className="font-bold text-ink">{percent(cardRate.value)} a year</strong> in{' '}
              {new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${cardRate.observedDate}T00:00:00Z`))}.{' '}
              <a className="link" href={cardRate.sourceUrl} rel="noreferrer">
                Source: Federal Reserve, via FRED
              </a>
              . This product uses the FRED&reg; API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.
            </p>
          )}
        </Section>

        <Section title="Savings and monthly amount">
          <div className="grid gap-4 sm:grid-cols-2">
            <AmountField
              id="savings"
              label="Current savings (USD)"
              unit="$"
              value={draft.savings}
              help={{ about: 'current savings', text: 'Money you could reach in an emergency, such as a savings account.' }}
              onChange={(savings) => onChange({ ...draft, savings })}
              onBlur={() => visit('savings')}
              error={errorFor('savings', draft.savings)}
            />
            <AmountField
              id="emergencyFundGoal"
              label="Emergency fund goal (USD)"
              unit="$"
              value={draft.emergencyFundGoal}
              help={{ about: 'the emergency fund goal', text: 'Savings kept for surprises, such as a repair or a gap in income. Many people aim for three to six months of essential spending.' }}
              onChange={(emergencyFundGoal) => onChange({ ...draft, emergencyFundGoal })}
              onBlur={() => visit('emergencyFundGoal')}
              error={errorFor('emergencyFundGoal', draft.emergencyFundGoal)}
            />
          </div>
          <div className="mt-4">
            <AmountField
              id="monthlyBudget"
              label="Monthly amount for debt and savings together (USD)"
              unit="$"
              value={draft.monthlyBudget}
              help={{ about: 'the monthly amount', text: 'Everything you can put towards debt and savings each month. Minimum payments come out of it first; the strategy directs what is left.' }}
              onChange={(monthlyBudget) => onChange({ ...draft, monthlyBudget })}
              onBlur={() => visit('monthlyBudget')}
              error={errorFor('monthlyBudget', draft.monthlyBudget)}
            />
            <BudgetSplit draft={draft} totals={totals} onClearExtra={() => onChange({ ...draft, extraPerMonth: 0 })} />
          </div>
        </Section>
      </div>
  )
}

/** Extra each month, under the chart it redraws. Moving it updates the comparison in place. */
export function ExtraSlider({ draft, onChange, impact }: Pick<Props, 'draft' | 'onChange'> & { impact?: string }) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <span className="flex items-center gap-1.5">
          <label htmlFor="extraPerMonth" className="font-medium">
            Extra per month
          </label>
          <Hint about="extra per month">Money added on top of your monthly amount. Slide it to see how much sooner the debt is gone; the chart and the table update as you move.</Hint>
        </span>
        <output htmlFor="extraPerMonth" className="money text-[1.15rem] font-bold" data-testid="extra-value">
          {usd(draft.extraPerMonth)} a month
        </output>
      </div>
      <input
        id="extraPerMonth"
        className="slider"
        type="range"
        min={0}
        max={MAX_EXTRA_PER_MONTH}
        step={10}
        value={draft.extraPerMonth}
        onChange={(event) => onChange({ ...draft, extraPerMonth: Number(event.target.value) })}
        aria-valuetext={`${usd(draft.extraPerMonth)} extra a month`}
      />
      <div className="money flex justify-between text-[0.85rem] text-slate" aria-hidden="true">
        <span>{usd(0)}</span>
        <span>{usd(MAX_EXTRA_PER_MONTH)}</span>
      </div>
      {/* What the extra buys, in a sentence: the reason to move the slider at all. */}
      {impact && (
        <p className="mt-2 border-t border-line pt-2 font-medium" data-testid="extra-impact" role="status">
          {impact}
        </p>
      )}
    </>
  )
}

/** One-off extra payments, such as a bonus or a tax refund. */
export function OneOffs({ draft, errors, start, onChange, onReplace }: Pick<Props, 'draft' | 'errors' | 'start' | 'onChange' | 'onReplace'>) {
  const [visited, setVisited] = useState<Record<string, boolean>>({})
  const visit = (field: string) => setVisited((current) => (current[field] ? current : { ...current, [field]: true }))
  const errorFor = (field: string, value: string) => (value.trim() !== '' || visited[field] ? errors[field] : undefined)

  return (
    <>
      <fieldset>
        <legend className="mb-3 text-[0.92rem] text-slate">A bonus or a tax refund. It goes to the debt the strategy is paying down that month.</legend>
        {draft.oneOffPayments.length > 0 && (
          <ul className="mb-3 flex flex-col gap-3">
            {draft.oneOffPayments.map((payment, index) => {
              const key = `oneOff.${payment.id}`
              const set = (change: Partial<typeof payment>) =>
                onChange({ ...draft, oneOffPayments: draft.oneOffPayments.map((p) => (p.id === payment.id ? { ...p, ...change } : p)) })
              return (
                <li key={payment.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]">
                  <div>
                    <label htmlFor={`${key}.month`} className="mb-1 block text-[0.92rem]">
                      Month <span className="sr-only">of payment {index + 1}</span>
                    </label>
                    <select id={`${key}.month`} className="field" value={payment.month} onChange={(event) => set({ month: Number(event.target.value) })}>
                      {Array.from({ length: Math.max(120, payment.month) }, (_, i) => i + 1).map((month) => (
                        <option key={month} value={month}>
                          {monthShort(month, start)}
                          {month === 1 ? ' (this month)' : ''}
                        </option>
                      ))}
                    </select>
                    <FieldError id={`${key}.month-error`} message={errors[`${key}.month`]} />
                  </div>
                  <AmountField
                    id={`${key}.amount`}
                    label={<>Amount <span className="sr-only">of payment {index + 1}</span> (USD)</>}
                    unit="$"
                    value={payment.amount}
                    onChange={(amount) => set({ amount })}
                    onBlur={() => visit(`${key}.amount`)}
                    error={errorFor(`${key}.amount`, payment.amount)}
                  />
                  <button
                    type="button"
                    className="button max-sm:col-span-2 sm:mt-[1.75rem]"
                    onClick={() => onReplace({ ...draft, oneOffPayments: draft.oneOffPayments.filter((p) => p.id !== payment.id) }, `Removed the one-off payment for ${monthName(payment.month, start)}.`)}
                    aria-label={`Remove one-off payment ${index + 1}, ${monthName(payment.month, start)}`}
                  >
                    Remove
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <button
          type="button"
          className="button"
          disabled={draft.oneOffPayments.length >= MAX_ONE_OFFS}
          onClick={() => onChange({ ...draft, oneOffPayments: [...draft.oneOffPayments, { id: newId(), month: 1, amount: '' }] })}
        >
          Add a one-off payment
        </button>
        <FieldError id="oneOffPayments-error" message={errors.oneOffPayments} />
      </fieldset>
    </>
  )
}
