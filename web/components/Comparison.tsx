'use client'

import { type CSSProperties, type ReactNode, useState } from 'react'
import type { Simulation, Stalled, StrategyResult } from '@/lib/api'
import { dollarsApart, duration, monthName, monthsApart, monthShort, usd } from '@/lib/format'
import { balanceAt, samePlan, strategyStyle } from '@/lib/strategies'
import { DebtChart, useChartHeight } from './DebtChart'
import { Disclosure } from './Disclosure'
import { Hint } from './Hint'
import { Badge } from './ui'

/** The assumptions behind every number, said plainly and kept next to the results. */
export const assumptions = [
  'Every APR stays fixed for the whole plan.',
  'You do not borrow anything new.',
  'There are no fees, penalties or promotional rates.',
  'Savings earn no interest.',
  'Every payment is made in full and on time.',
  'Interest is added once a month: balance × APR ÷ 12, rounded to the cent.',
]

/** One figure on the strategy card: what it is, the value, then what it compares with. */
function Figure({ label, help, value, context, testId }: { label: string; help: string; value: string; context: string; testId: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-line py-3">
      <dt className="flex items-center gap-1.5 text-[0.95rem]">
        {label}
        <Hint about={label.toLowerCase()}>{help}</Hint>
      </dt>
      <dd className="flex flex-col items-end text-right">
        <span className="money text-[1.15rem] font-bold whitespace-normal" data-testid={testId}>
          {value}
        </span>
        <span className="text-[0.85rem] leading-snug text-slate">{context}</span>
      </dd>
    </div>
  )
}

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * The answer as a card. It opens on the recommended strategy; the arrows step through the
 * other two, each showing the same three figures and how it differs from the recommendation.
 */
function StrategyCards({
  simulation,
  recommended,
  ordered,
  index,
  onTurn,
  start,
  debtCount,
  onEdit,
}: {
  simulation: Simulation
  recommended: StrategyResult
  /** The recommended strategy first, then the others. */
  ordered: StrategyResult[]
  index: number
  onTurn: (index: number) => void
  start: Date
  /** How many debts were entered, when known: one debt leaves nothing to order. */
  debtCount?: number
  /** Goes back to the form, on the planner. */
  onEdit?: () => void
}) {
  const allSame = simulation.strategies.every((s) => samePlan(s, recommended))
  const turn = (by: number) => onTurn((index + by + ordered.length) % ordered.length)
  const oneDebt = debtCount === 1
  const fundFull = recommended.fundReachedMonth === 0

  return (
    <section aria-labelledby="comparison-title" className="rounded-md border border-slate bg-paper">
      <div className="flex items-center justify-between gap-3 border-b border-slate bg-tint px-4 py-2">
        <h2 id="comparison-title" tabIndex={-1} className="text-[1.05rem]">
          {allSame ? 'Your plan' : index === 0 ? 'Recommended strategy' : 'Another strategy'}
        </h2>
        <div className={allSame ? 'hidden' : 'flex items-center gap-2'}>
          <span className="money text-[0.88rem] text-slate" aria-hidden="true">
            {index + 1} of {ordered.length}
          </span>
          <button type="button" className="button w-11 px-0" aria-label="Previous strategy" onClick={() => turn(-1)}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
              <path d="M9 2L4 7l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button type="button" className="button w-11 px-0" aria-label="Next strategy" onClick={() => turn(1)}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
              <path d="M5 2l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <div aria-live="polite">
        {ordered.map((strategy, i) => {
          const isRecommended = i === 0
          const twin = simulation.strategies.slice(0, simulation.strategies.indexOf(strategy)).find((earlier) => samePlan(earlier, strategy))
          return (
            <article key={strategy.strategy} hidden={i !== index} data-testid={`strategy-${strategy.strategy}`} className="px-4 pt-4 pb-1">
              <div data-testid={isRecommended ? 'recommendation' : undefined}>
                {allSame ? (
                  isRecommended && (
                    <>
                      <h3 className="text-[1.5rem] leading-tight">All three strategies give the same plan</h3>
                      <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 leading-snug">
                        {oneDebt && <li>You entered one debt, so there is no order to choose.</li>}
                        {fundFull && <li>Your savings already meet your emergency fund goal, so nothing needs to go to savings.</li>}
                        {!oneDebt && !fundFull && <li>With these numbers every strategy pays the same debts in the same months.</li>}
                      </ul>
                      <p className="mt-3 font-bold">To compare strategies</p>
                      <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 leading-snug">
                        {oneDebt && <li>Add your other debts: cards, loans, anything with a balance.</li>}
                        {fundFull && <li>Set an emergency fund goal higher than your savings.</li>}
                        {!oneDebt && !fundFull && <li>Raise the monthly amount or the extra, so there is money left after the minimums.</li>}
                      </ul>
                      {onEdit && (
                        <button type="button" className="button button-primary mt-3" onClick={onEdit}>
                          Change your numbers
                        </button>
                      )}
                    </>
                  )
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className="text-[1.5rem] leading-tight">{strategy.label}</h3>
                      <Hint about={strategy.label}>{strategyStyle[strategy.strategy].how}</Hint>
                    </div>
                    {isRecommended ? (
                      <p className="mt-1 leading-snug">{capitalised(simulation.recommendation.sentence)}</p>
                    ) : (
                      twin && (
                        <p className="mt-2">
                          <Badge tone="neutral">Same result as {twin.label}</Badge>
                        </p>
                      )
                    )}
                  </>
                )}
              </div>
              <dl className="mt-4">
                <Figure
                  label="Debt-free"
                  help="The month the last debt reaches $0."
                  testId="debt-free"
                  value={strategy.debtFreeMonth === 0 ? 'Already debt-free' : monthName(strategy.debtFreeMonth, start)}
                  context={
                    strategy.debtFreeMonth === 0
                      ? 'Nothing is owed'
                      : isRecommended
                        ? `in ${duration(strategy.debtFreeMonth)}`
                        : strategy.debtFreeMonth === recommended.debtFreeMonth
                          ? 'the same month'
                          : monthsApart(strategy.debtFreeMonth, recommended.debtFreeMonth)
                  }
                />
                <Figure
                  label="Total interest paid"
                  help="Everything paid in interest from today until the debt is gone, on top of what you owe now."
                  testId="total-interest"
                  value={usd(strategy.totalInterest)}
                  context={
                    isRecommended
                      ? `on ${usd(strategy.totalPaidToDebt - strategy.totalInterest)} owed`
                      : strategy.totalInterest === recommended.totalInterest
                        ? 'the same'
                        : dollarsApart(strategy.totalInterest, recommended.totalInterest)
                  }
                />
                <Figure
                  label="Emergency fund full"
                  help="The month your savings reach the emergency fund goal you entered."
                  testId="fund-full"
                  value={strategy.fundReachedMonth === 0 ? 'Already full' : monthName(strategy.fundReachedMonth, start)}
                  context={
                    strategy.fundReachedMonth === 0
                      ? 'Savings meet the goal today'
                      : isRecommended
                        ? `in ${duration(strategy.fundReachedMonth)}`
                        : strategy.fundReachedMonth === recommended.fundReachedMonth
                          ? 'the same month'
                          : monthsApart(strategy.fundReachedMonth, recommended.fundReachedMonth)
                  }
                />
              </dl>
            </article>
          )
        })}
      </div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line px-4 py-2 text-[0.85rem] text-slate">
        <Badge tone="warning">Estimate</Badge>
        <span>This is an estimate, not financial advice.</span>
      </p>
    </section>
  )
}

/** A row on the stalled card: a plain label and its amount. */
function Amount({ label, help, value, context, testId }: { label: string; help: string; value: string; context?: string; testId: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-line py-3">
      <dt className="flex items-center gap-1.5 text-[0.95rem]">
        {label}
        <Hint about={label.toLowerCase()}>{help}</Hint>
      </dt>
      <dd className="flex flex-col items-end text-right">
        <span className="money text-[1.15rem] font-bold" data-testid={testId}>
          {value}
        </span>
        {context && <span className="text-[0.85rem] leading-snug text-slate">{context}</span>}
      </dd>
    </div>
  )
}

/**
 * The card when the payment does not clear the debt. It is an answer, not an error: what the
 * payment does, and the two amounts that would change it.
 */
function StalledCard({ simulation, stalled }: { simulation: Simulation; stalled: Stalled }) {
  return (
    <section aria-labelledby="comparison-title" className="rounded-md border border-slate bg-paper" data-testid="stalled">
      <div className="border-b border-slate bg-tint px-4 py-2">
        <h2 id="comparison-title" tabIndex={-1} className="text-[1.05rem]">
          Your plan
        </h2>
      </div>
      <div className="px-4 pt-4 pb-1">
        <h3 className="text-[1.5rem] leading-tight">
          {stalled.shrinking ? `At ${usd(simulation.budget)} a month, this takes more than 50 years` : `At ${usd(simulation.budget)} a month, the debt grows`}
        </h3>
        <p className="mt-1 leading-snug">
          {stalled.shrinking
            ? 'The payment is only just more than the interest, so the balance barely moves.'
            : 'Interest adds more each month than the payment takes off, so the balance goes up.'}{' '}
          Slide the extra, or change your monthly amount, to see when it clears.
        </p>
        <dl className="mt-4">
          <Amount
            label="Interest added"
            help="The interest charged on what you owe in the first month. It rises as the balance does."
            testId="stalled-interest"
            value={`${usd(stalled.monthlyInterest)} a month`}
            context={`against ${usd(simulation.budget)} paid`}
          />
          <Amount
            label="To start clearing it"
            help="The smallest monthly amount, in whole dollars, that ever brings the debt to $0. At exactly this amount it still takes close to 50 years."
            testId="stalled-to-clear"
            value={`${usd(stalled.budgetToClear)} a month`}
            context={`${usd(stalled.budgetToClear - simulation.budget)} more than now`}
          />
          <Amount
            label="To clear it in 5 years"
            help="The smallest monthly amount, in whole dollars, that brings the debt to $0 within 60 months."
            testId="stalled-five-years"
            value={`${usd(stalled.budgetForFiveYears)} a month`}
            context={`${usd(stalled.budgetForFiveYears - simulation.budget)} more than now`}
          />
        </dl>
      </div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line px-4 py-2 text-[0.85rem] text-slate">
        <Badge tone="warning">Estimate</Badge>
        <span>This is an estimate, not financial advice.</span>
      </p>
    </section>
  )
}

const PAGE_SIZES = [12, 24, 60] as const

/**
 * The chart's numbers as a table: remaining debt at the end of every month, per strategy. It is
 * paged, and scrolls inside a frame as tall as the chart it stands in for, so neither more rows
 * nor another page ever makes the screen longer.
 */
function BalanceTable({ simulation, start, open = false }: { simulation: Simulation; start: Date; open?: boolean }) {
  const [size, setSize] = useState<number | 'all'>(PAGE_SIZES[0])
  const [wanted, setWanted] = useState(0)
  const { strategies, totalDebt } = simulation
  const lastMonth = Math.max(1, ...strategies.map((s) => s.debtFreeMonth))
  // A row for today, then one for each month.
  const total = lastMonth + 1
  const perPage = size === 'all' ? total : size
  const pages = Math.max(1, Math.ceil(total / perPage))
  // The plan can get shorter while a later page is open.
  const page = Math.min(wanted, pages - 1)
  const first = page * perPage
  const months = Array.from({ length: Math.min(perPage, total - first) }, (_, i) => first + i)
  const height = useChartHeight()

  return (
    <div className="table-frame">
      <div
        className="table-scroll"
        style={{ '--table-height': `${height}px` } as CSSProperties}
        tabIndex={0}
        role="region"
        aria-label="Remaining debt at the end of each month"
      >
        <table className="table table-compact table-stack table-rows-hover" role="table" data-testid="balance-table">
          <caption>Remaining debt at the end of each month, in US dollars</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th role="columnheader" scope="col">
                Month
              </th>
              {strategies.map((s) => (
                <th role="columnheader" scope="col" key={s.strategy} className="num">
                  {s.label} (USD)
                </th>
              ))}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {months.map((month) => (
              <tr role="row" key={month} data-month={month}>
                <th role="rowheader" scope="row" className="whitespace-nowrap">
                  {month === 0 ? 'Today' : monthShort(month, start)}
                  {month > 0 && <span className="ml-2 text-[0.85rem] font-normal text-slate">month {month}</span>}
                </th>
                {strategies.map((s) => (
                  <td role="cell" key={s.strategy} className="num" data-label={s.label} data-strategy={s.strategy}>
                    {usd(balanceAt(s, month, totalDebt, open))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 border-t border-slate bg-canvas px-3 py-2 sm:grid-cols-[1fr_auto_1fr]">
        <label className="flex items-center gap-2 text-[0.92rem] max-sm:col-span-2">
          Show
          <select
            className="field w-auto py-1"
            aria-label="Rows to show"
            value={size}
            onChange={(event) => {
              setSize(event.target.value === 'all' ? 'all' : Number(event.target.value))
              setWanted(0)
            }}
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            <option value="all">All</option>
          </select>
          rows
        </label>
        <p className="money text-[0.92rem]" role="status" data-testid="table-range">
          Showing {first + 1} to {first + months.length} of {total}
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className="button w-11 px-0" aria-label="Previous rows" disabled={page === 0} onClick={() => setWanted(page - 1)}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
              <path d="M9 2L4 7l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button type="button" className="button w-11 px-0" aria-label="Next rows" disabled={page >= pages - 1} onClick={() => setWanted(page + 1)}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
              <path d="M5 2l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

interface Props {
  /** The comparison to show, or null when there is none yet. */
  simulation: Simulation | null
  /** True while the numbers on screen are older than the form. */
  updating?: boolean
  /** Shown in place of the results when there are none: what to do next. */
  empty: ReactNode
  /** The first month of the plan. */
  start: Date
  /** The extra-per-month slider, on the planner: it sits under the chart it redraws. */
  slider?: ReactNode
  /** One-off payments, on the planner. */
  oneOffs?: ReactNode
  /** True when there are one-off payments already, so their section starts open. */
  oneOffsOpen?: boolean
  /** Buttons under everything, such as the way back to the numbers. */
  actions?: ReactNode
  /** False when it is a step inside the planner's own panel, which already has the border. */
  framed?: boolean
  /** How many debts were entered, when known. */
  debtCount?: number
  /** Goes back to the form, on the planner. */
  onEdit?: () => void
}

/**
 * The answer in two columns: the chart and its slider on the left, and on the right the
 * strategy card with everything else folded away under it. On a narrow screen the card comes
 * first, then the chart.
 */
export function Comparison({ simulation, updating, empty, start, slider, oneOffs, oneOffsOpen, actions, framed = true, debtCount, onEdit }: Props) {
  const stalled = simulation?.stalled ?? null
  // A payment that does not clear the debt is drawn as one line: the next five years at it.
  const projection: Simulation | null =
    simulation && stalled
      ? {
          ...simulation,
          strategies: [
            {
              strategy: 'HighestInterestFirst',
              label: 'At this payment',
              recommended: true,
              debtFreeMonth: stalled.balances.length,
              fundReachedMonth: 0,
              totalInterest: 0,
              totalPaidToDebt: 0,
              payoffs: [],
              months: stalled.balances.map((debtBalance, i) => ({ month: i + 1, interest: 0, debtPayment: 0, savingsContribution: 0, debtBalance, savingsBalance: 0 })),
            },
          ],
        }
      : null
  const recommended = stalled ? undefined : simulation?.strategies.find((s) => s.recommended)
  // The same numbers two ways: the chart, or every month in a table.
  const [view, setView] = useState<'chart' | 'table'>('chart')
  // Which strategy the card is on. The chart picks out the same one.
  const [shown, setShown] = useState<{ index: number; recommended: string }>({ index: 0, recommended: '' })

  if (simulation && stalled && projection) {
    return (
      <section id="comparison" aria-label="Your comparison" className={framed ? 'rounded-md border border-slate bg-paper p-4 sm:p-5' : undefined}>
        <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]">
          <div className="flex flex-col gap-4 max-lg:order-2">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="flex items-center gap-2">
                <h3 className="text-[1.05rem]">Debt by month at this payment</h3>
                <Hint about="the chart">The next five years if you keep paying this amount. Hover or tap the chart to read one month. Table shows every month as numbers.</Hint>
              </span>
              <span className="flex items-center gap-2">
                <span role="status">{updating ? <Badge tone="info">Updating</Badge> : null}</span>
                <span className="flex" role="group" aria-label="Show debt as">
                  <button type="button" className="button rounded-r-none" aria-pressed={view === 'chart'} onClick={() => setView('chart')}>
                    Chart
                  </button>
                  <button type="button" className="button -ml-px rounded-l-none" aria-pressed={view === 'table'} onClick={() => setView('table')}>
                    Table
                  </button>
                </span>
              </span>
            </div>
            {view === 'chart' ? <DebtChart simulation={projection} start={start} open /> : <BalanceTable simulation={projection} start={start} open />}
            {slider && <div className="rounded-md border border-line bg-canvas px-4 py-3">{slider}</div>}
          </div>
          <div className="flex flex-col max-lg:order-1">
            <StalledCard simulation={simulation} stalled={stalled} />
            {oneOffs && (
              <div className="mt-5 border-b border-line">
                <Disclosure title="One-off extra payments" defaultOpen={oneOffsOpen}>
                  {oneOffs}
                </Disclosure>
              </div>
            )}
          </div>
        </div>
      </section>
    )
  }

  if (!simulation || !recommended) {
    return (
      <section id="comparison" aria-labelledby="comparison-title" className={framed ? 'rounded-md border border-slate bg-paper p-4 sm:p-5' : undefined}>
        <h2 id="comparison-title" tabIndex={-1} className="mb-4 text-[1.5rem]">
          Your comparison
        </h2>
        <div className="rounded-md border border-dashed border-slate bg-canvas px-4 py-6">{empty}</div>
      </section>
    )
  }

  // The recommended strategy first, then the others in their usual order. When the
  // recommendation changes, the card goes back to it.
  const ordered = [recommended, ...simulation.strategies.filter((s) => s.strategy !== recommended.strategy)]
  const index = shown.recommended === recommended.strategy ? shown.index : 0

  return (
    <section id="comparison" aria-label="Your comparison" className={framed ? 'rounded-md border border-slate bg-paper p-4 sm:p-5' : undefined}>
      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]">
        <div className="flex flex-col gap-4 max-lg:order-2">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="flex items-center gap-2">
              <h3 className="text-[1.05rem]">Remaining debt by month</h3>
              <Hint about="the chart">
                Hover or tap the chart to read one month. A dot marks the month a strategy reaches $0. The bold line is the strategy on the card. Table shows every month as numbers.
              </Hint>
            </span>
            <span className="flex items-center gap-2">
              <span role="status">{updating ? <Badge tone="info">Updating</Badge> : null}</span>
              <span className="flex" role="group" aria-label="Show remaining debt as">
                <button type="button" className="button rounded-r-none" aria-pressed={view === 'chart'} onClick={() => setView('chart')}>
                  Chart
                </button>
                <button type="button" className="button -ml-px rounded-l-none" aria-pressed={view === 'table'} onClick={() => setView('table')}>
                  Table
                </button>
              </span>
            </span>
          </div>
          {view === 'chart' ? <DebtChart simulation={simulation} start={start} highlight={ordered[index].strategy} /> : <BalanceTable simulation={simulation} start={start} />}
          {slider && <div className="rounded-md border border-line bg-canvas px-4 py-3">{slider}</div>}
        </div>

        {/* Beside the chart this column is exactly as tall as the chart's, and scrolls inside
            itself, so opening a section never makes the page longer. */}
        <div className="relative max-lg:order-1 lg:min-h-[26rem]">
        <div className="side-scroll flex flex-col lg:absolute lg:inset-0 lg:overflow-y-auto lg:pr-2" tabIndex={0} role="region" aria-label="Strategies and options">
          <StrategyCards
            simulation={simulation}
            recommended={recommended}
            ordered={ordered}
            index={index}
            onTurn={(next) => setShown({ index: next, recommended: recommended.strategy })}
            start={start}
            debtCount={debtCount}
            onEdit={onEdit}
          />
          <div className="mt-5 border-b border-line">
            {oneOffs && (
              <Disclosure title="One-off extra payments" defaultOpen={oneOffsOpen}>
                {oneOffs}
              </Disclosure>
            )}
            <Disclosure title="What these numbers assume">
              <ul className="flex list-disc flex-col gap-1 pl-5 text-[0.95rem]">
                {assumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
            </Disclosure>
          </div>
          {actions && <div className="pt-5">{actions}</div>}
        </div>
        </div>
      </div>
    </section>
  )
}
