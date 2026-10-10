'use client'

// FOCUS: What does this shared plan say, and do I want a copy of my own?
//
// Regions (four at most):
//   1. The header (in the layout).
//   2. "Shared plan": the numbers it was made from, read-only, with Make a copy to edit.
//   3. "Comparison": the same panel as the planner, for these numbers.
//   4. The footer (in the layout).

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Comparison } from '@/components/Comparison'
import { Badge } from '@/components/ui'
import { api, ApiError, type SavedScenario } from '@/lib/api'
import { fromInput } from '@/lib/draft'
import { monthName, percent, startOfMonth, usd } from '@/lib/format'
import { replaceDraft, useDraft } from '@/lib/store'
import { useSimulation } from '@/lib/useSimulation'

export default function SharedPlanPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const { draft } = useDraft()
  const [start] = useState(() => startOfMonth(new Date()))
  const [scenario, setScenario] = useState<SavedScenario | null>(null)
  const [problem, setProblem] = useState<{ notFound: boolean; message: string } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let current = true
    api
      .scenario(code)
      .then((loaded) => {
        if (!current) return
        setScenario(loaded)
        setProblem(null)
      })
      .catch((error) => {
        if (!current) return
        const notFound = error instanceof ApiError && error.status === 404
        setProblem({ notFound, message: error instanceof ApiError ? error.message : 'Something went wrong. Try again.' })
      })
    return () => {
      current = false
    }
  }, [code, attempt])

  const simulation = useSimulation(scenario?.input ?? null, 0)

  if (problem) {
    return (
      <section aria-labelledby="missing-title" className="max-w-[44rem] rounded-md border border-slate bg-paper px-5 py-6">
        <Badge tone="error">{problem.notFound ? 'Not found' : 'Not loaded'}</Badge>
        <h1 id="missing-title" className="mt-2 text-[1.6rem]">
          {problem.notFound ? 'This shared plan is not here' : 'This shared plan could not be loaded'}
        </h1>
        <p className="mt-2">
          {problem.notFound ? 'The link may be mistyped, or the plan was removed after 12 months without being opened. Ask for a new link, or start a plan of your own.' : problem.message}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {!problem.notFound && (
            <button type="button" className="button button-primary" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          )}
          <Link href="/" className={`button ${problem.notFound ? 'button-primary' : ''}`}>
            Start with an example
          </Link>
        </div>
      </section>
    )
  }

  if (!scenario) {
    return (
      <p role="status" className="text-slate">
        Loading the shared plan
      </p>
    )
  }

  const { input } = scenario
  const copy = () => {
    replaceDraft(fromInput(input), draft ? 'Replaced your numbers with a copy of the shared plan.' : 'Made a copy of the shared plan. Change any number.')
    router.push('/')
  }
  const totalDebt = input.debts.reduce((sum, debt) => sum + (debt.balance ?? 0), 0)
  const totalMinimums = input.debts.reduce((sum, debt) => sum + (debt.minimumPayment ?? 0), 0)
  const oneOffs = input.oneOffPayments

  return (
    <>
      <h1 className="sr-only">A shared Ripple plan</h1>
      <div className="grid items-start gap-5 min-[1100px]:grid-cols-[minmax(0,36rem)_minmax(0,1fr)]">
        <section aria-labelledby="shared-title" className="rounded-md border border-slate bg-paper">
          <div className="border-b border-slate px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 id="shared-title" className="text-[1.2rem]">
                Shared plan
              </h2>
              <Badge tone="info">Read only</Badge>
            </div>
            <p className="mt-1 text-[0.92rem] text-slate">
              Someone shared these numbers with you in {new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(scenario.createdAt))}. You cannot change them here.
            </p>
          </div>

          <div className="flex flex-col gap-5 px-4 py-5 sm:px-5">
            <div className="table-frame">
              <table className="table table-stack" role="table">
                <caption>Debts in this plan</caption>
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader" scope="col">
                      Name
                    </th>
                    <th role="columnheader" scope="col" className="num">
                      Balance (USD)
                    </th>
                    <th role="columnheader" scope="col" className="num">
                      APR (% a year)
                    </th>
                    <th role="columnheader" scope="col" className="num">
                      Minimum (USD a month)
                    </th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {input.debts.map((debt, i) => (
                    <tr role="row" key={i}>
                      <th role="rowheader" scope="row">
                        {debt.name}
                      </th>
                      <td role="cell" className="num" data-label="Balance">
                        {usd(debt.balance ?? 0)}
                      </td>
                      <td role="cell" className="num" data-label="APR">
                        {percent(debt.apr ?? 0)}
                      </td>
                      <td role="cell" className="num" data-label="Minimum a month">
                        {usd(debt.minimumPayment ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot role="rowgroup">
                  <tr role="row">
                    <th role="rowheader" scope="row">
                      Total
                    </th>
                    <td role="cell" className="num" data-label="Total owed">
                      {usd(totalDebt)}
                    </td>
                    <td role="cell" className="max-md:hidden" />
                    <td role="cell" className="num" data-label="Minimums a month">
                      {usd(totalMinimums)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 border-t border-line pt-4">
              <dt>Current savings</dt>
              <dd className="money text-right font-bold">{usd(input.savings ?? 0)}</dd>
              <dt>Emergency fund goal</dt>
              <dd className="money text-right font-bold">{usd(input.emergencyFundGoal ?? 0)}</dd>
              <dt>Monthly amount for debt and savings</dt>
              <dd className="money text-right font-bold">{usd(input.monthlyBudget ?? 0)} a month</dd>
              {(input.extraPerMonth ?? 0) > 0 && (
                <>
                  <dt>What-if extra</dt>
                  <dd className="money text-right font-bold">{usd(input.extraPerMonth ?? 0)} a month</dd>
                </>
              )}
              {oneOffs.map((payment, i) => (
                <div key={i} className="contents">
                  <dt>One-off payment, {monthName(payment.month ?? 1, start)}</dt>
                  <dd className="money text-right font-bold">{usd(payment.amount ?? 0)}</dd>
                </div>
              ))}
            </dl>

            <div className="border-t border-line pt-4">
              <button type="button" className="button button-primary" onClick={copy}>
                Make a copy to edit
              </button>
              <p className="mt-2 text-[0.92rem] text-slate">
                {draft
                  ? 'The copy replaces the numbers already in your planner. You can undo that on the next screen.'
                  : 'The copy is kept in this browser. The shared plan itself does not change.'}
              </p>
            </div>
          </div>
        </section>

        <Comparison
          simulation={simulation.shown}
          updating={simulation.updating}
          start={start}
          empty={
            simulation.notice ? (
              <>
                <p>{simulation.notice}</p>
                <button type="button" className="button mt-3" onClick={simulation.retry}>
                  Try again
                </button>
              </>
            ) : simulation.code ? (
              <p>{simulation.fields.monthlyBudget}</p>
            ) : (
              <p role="status">Working out the three strategies</p>
            )
          }
        />
      </div>
    </>
  )
}
