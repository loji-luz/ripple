'use client'

// FOCUS: Should I pay off debt first, or build my emergency fund first?
//
// One panel, two steps, one at a time:
//   1. "Your numbers": the debts, the savings and the monthly amount.
//   2. "Your comparison": the recommendation, the three strategies in one table, the what-ifs
//      that change them, the assumptions, the chart.
// With no draft yet, the panel is replaced by the example households to start from.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Comparison } from '@/components/Comparison'
import { ExamplePicker } from '@/components/ExamplePicker'
import { ExtraSlider, NumbersForm, OneOffs } from '@/components/NumbersPanel'
import { ShareBox } from '@/components/ShareBox'
import { api, type Example, type ReferenceRate } from '@/lib/api'
import { blankDraft, type Draft, fromInput, toRequest, totals as totalsOf } from '@/lib/draft'
import { duration, startOfMonth, usd } from '@/lib/format'
import { dismissUndo, replaceDraft, saveDraft, undoReplace, useDraft } from '@/lib/store'
import { useSimulation } from '@/lib/useSimulation'

type Step = 'numbers' | 'comparison'

export default function PlannerPage() {
  const { loaded, draft, undo } = useDraft()
  const [start] = useState(() => startOfMonth(new Date()))
  const [cardRate, setCardRate] = useState<ReferenceRate | null>(null)
  const [step, setStep] = useState<Step>('numbers')
  // Set when Compare is pressed with boxes missing: every problem is shown, not only visited ones.
  const [showAllErrors, setShowAllErrors] = useState(false)
  const panel = useRef<HTMLElement>(null)
  const [sharing, setSharing] = useState(false)
  // What to move the keyboard to after the next paint: a step's heading, or the first problem.
  const [focusNext, setFocusNext] = useState<'heading' | 'problem' | null>(null)

  // The average card rate is shown only if one has really been imported.
  useEffect(() => {
    api
      .referenceRates()
      .then((rates) => setCardRate(rates[0] ?? null))
      .catch(() => setCardRate(null))
  }, [])

  const request = useMemo(() => (draft ? toRequest(draft) : null), [draft])
  const simulation = useSimulation(request?.input ?? null)
  const totals = useMemo(() => (draft ? totalsOf(draft) : null), [draft])

  // The same plan with no extra and no one-off payments, to say what the extra money buys.
  const baselineInput = useMemo(() => {
    const input = request?.input
    if (!input || (input.extraPerMonth === 0 && input.oneOffPayments.length === 0)) return null
    return { ...input, extraPerMonth: 0, oneOffPayments: [] }
  }, [request])
  const baseline = useSimulation(baselineInput)

  const errors = useMemo(() => {
    const merged: Record<string, string> = {}
    if (request) for (const [path, message] of Object.entries(simulation.fields)) merged[request.fieldFor(path)] = message
    return { ...merged, ...request?.errors }
  }, [request, simulation.fields])

  // Changing step moves the keyboard and the screen reader with it.
  useEffect(() => {
    if (!focusNext) return
    // The first box that is wrong, or the first box when nothing has been entered at all.
    const target =
      focusNext === 'problem'
        ? (panel.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? panel.current?.querySelector<HTMLElement>('input'))
        : panel.current?.querySelector<HTMLElement>('[data-step-heading], #comparison-title')
    target?.focus()
    if (focusNext === 'heading') panel.current?.scrollIntoView({ block: 'start' })
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the request to move focus is used once
    setFocusNext(null)
  }, [focusNext])

  const undoBanner = undo && (
    <div role="status" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border border-slate bg-paper px-4 py-2">
      <p>{undo.message}</p>
      <div className="flex gap-2">
        <button type="button" className="button" onClick={undoReplace}>
          Undo
        </button>
        <button type="button" className="button" onClick={dismissUndo}>
          Dismiss
        </button>
      </div>
    </div>
  )

  if (!loaded) return <p className="sr-only">Loading Ripple</p>

  if (!draft || !totals || !request) {
    // An example is complete, so it opens on its comparison. A blank form opens on the numbers.
    const pick = (example: Example) => {
      replaceDraft(fromInput(example.input), `Loaded the example “${example.title}”.`)
      setStep('comparison')
    }
    return (
      <>
        {undoBanner}
        <section aria-labelledby="start-title" className="flex flex-col gap-5">
          <div className="max-w-[52rem]">
            <h1 id="start-title" className="text-[1.9rem] sm:text-[2.4rem]">
              Should you pay off debt first, or build your emergency fund first?
            </h1>
            <p className="mt-2 text-[1.05rem]">
              Start with an example household and Ripple shows three strategies side by side: when each clears the debt, what it costs in interest, and when the emergency fund is full. Then change any
              number to make it yours.
            </p>
          </div>
          <ExamplePicker onPick={pick} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4">
            <button
              type="button"
              className="button"
              onClick={() => {
                saveDraft(blankDraft())
                setStep('numbers')
                setShowAllErrors(false)
              }}
            >
              Start with my own numbers
            </button>
            <p className="text-[0.92rem] text-slate">Your numbers stay in this browser. This is an estimate, not financial advice.</p>
          </div>
        </section>
      </>
    )
  }

  const change = (next: Draft) => saveDraft(next)

  const best = simulation.data?.strategies.find((s) => s.recommended)
  const bestWithout = baseline.data?.strategies.find((s) => s.recommended)
  // What "the extra" is, in words: the slider's amount, any one-off payments, or both.
  const oneOffTotal = (request.input?.oneOffPayments ?? []).reduce((sum, p) => sum + (p.amount ?? 0), 0)
  const extraNamed = [
    draft.extraPerMonth > 0 ? `${usd(draft.extraPerMonth)} extra a month` : null,
    oneOffTotal > 0 ? `${usd(oneOffTotal)} in one-off payments` : null,
  ]
    .filter(Boolean)
    .join(' and ')
  const stalled = simulation.data?.stalled
  const impact = stalled
    ? `Add ${usd(stalled.budgetToClear - simulation.data!.budget)} more a month to start clearing the debt, or ${usd(stalled.budgetForFiveYears - simulation.data!.budget)} more to clear it in 5 years.`
    : !baselineInput
    ? 'Slide to see how much sooner extra money clears the debt.'
    : baseline.code === 'BudgetBelowMinimums'
      ? `Without the ${extraNamed}, your monthly amount does not cover the minimum payments, so there is no plan to compare with.`
      : baseline.data?.stalled
        ? `Without the ${extraNamed}, the debt would not clear. With it, it does.`
      : best && bestWithout
        ? best.debtFreeMonth === bestWithout.debtFreeMonth && best.totalInterest === bestWithout.totalInterest
          ? `The ${extraNamed} makes no difference to the debt with these numbers.`
          : `With ${extraNamed}, you are debt-free ${
              bestWithout.debtFreeMonth > best.debtFreeMonth ? `${duration(bestWithout.debtFreeMonth - best.debtFreeMonth)} sooner` : 'in the same month'
            } and pay ${usd(Math.max(0, Math.round((bestWithout.totalInterest - best.totalInterest) * 100) / 100))} less interest than without it.`
        : undefined
  const problems = Object.keys(errors).length
  const ready = problems === 0 && request.input !== null

  const go = (next: Step) => {
    if (next === 'comparison' && !ready) {
      setShowAllErrors(true)
      setStep('numbers')
      setFocusNext('problem')
      return
    }
    setStep(next)
    setFocusNext('heading')
  }

  const steps: [Step, string][] = [
    ['numbers', 'Your numbers'],
    ['comparison', 'Your comparison'],
  ]
  const backToNumbers = (
    <button type="button" className="button mt-3" onClick={() => go('numbers')}>
      Change your numbers
    </button>
  )

  return (
    <>
      <h1 className="sr-only">Ripple: should you pay off debt first, or build your emergency fund first?</h1>
      {undoBanner}
      <section ref={panel} aria-label="Planner" className="w-full scroll-mt-4 rounded-md border border-slate bg-paper">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate px-4 py-3 sm:px-6">
          <nav aria-label="Steps">
            <ol className="flex">
              {steps.map(([name, label], i) => (
                <li key={name}>
                  <button
                    type="button"
                    className={`step ${i === 0 ? 'rounded-l-sm' : '-ml-px rounded-r-sm'}`}
                    aria-current={step === name ? 'step' : undefined}
                    onClick={() => go(name)}
                  >
                    <span className="step-number">{i + 1}</span>
                    {label}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            {step === 'comparison' && (
              <>
                <button type="button" className="button" onClick={() => go('numbers')}>
                  Change your numbers
                </button>
                {request.input && simulation.data && (
                  <div className="relative" onKeyDown={(event) => event.key === 'Escape' && setSharing(false)}>
                    <button type="button" className="button" aria-expanded={sharing} aria-controls="share-panel" onClick={() => setSharing(!sharing)}>
                      Share this plan
                    </button>
                    {sharing && (
                      <div id="share-panel" className="absolute top-full right-0 z-30 mt-2 w-[min(26rem,calc(100vw-2rem))] rounded-md border border-slate bg-paper p-4 shadow-[0_8px_24px_rgb(24_29_39/0.2)] max-sm:right-auto max-sm:left-0">
                        <ShareBox input={request.input} />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            <button
              type="button"
              className="button"
              onClick={() => {
                replaceDraft(null, 'Cleared your numbers.')
                setStep('numbers')
                setShowAllErrors(false)
                setSharing(false)
              }}
            >
              Start over
            </button>
          </div>
        </div>

        <div className="px-4 py-5 sm:px-6 sm:py-6">
          {step === 'numbers' ? (
            <>
              <h2 data-step-heading tabIndex={-1} className="mb-5 text-[1.5rem]">
                Your numbers
              </h2>
              <NumbersForm draft={draft} totals={totals} errors={errors} cardRate={cardRate} onChange={change} onReplace={replaceDraft} showAllErrors={showAllErrors} />
              <div className="mt-6 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-line pt-5">
                <p role="status" className="text-[0.92rem] text-error">
                  {showAllErrors && !ready ? (
                    <>
                      <span className="font-bold">Fix: </span>
                      {problems > 0 ? `${problems} ${problems === 1 ? 'box needs' : 'boxes need'} a number before the strategies can be compared.` : 'Enter a debt, your savings and a monthly amount before the strategies can be compared.'}
                    </>
                  ) : null}
                </p>
                <button type="button" className="button button-primary" onClick={() => go('comparison')}>
                  Compare the strategies
                </button>
              </div>
            </>
          ) : (
            <Comparison
              framed={false}
              simulation={simulation.shown}
              updating={simulation.updating}
              start={start}
              slider={<ExtraSlider draft={draft} onChange={change} impact={impact} />}
              debtCount={totals.debtCount}
              onEdit={() => go('numbers')}
              oneOffs={<OneOffs draft={draft} errors={errors} start={start} onChange={change} onReplace={replaceDraft} />}
              oneOffsOpen={draft.oneOffPayments.length > 0}
              empty={
                simulation.notice ? (
                  <>
                    <p>{simulation.notice}</p>
                    <button type="button" className="button mt-3" onClick={simulation.retry}>
                      Try again
                    </button>
                  </>
                ) : simulation.code ? (
                  <>
                    <h3 className="text-[1.05rem]">No plan with these numbers yet</h3>
                    <p className="mt-1">{simulation.fields.monthlyBudget}</p>
                    {backToNumbers}
                  </>
                ) : problems > 0 ? (
                  <>
                    <h3 className="text-[1.05rem]">A few boxes still need a number</h3>
                    <p className="mt-1">Go back to your numbers and fill in the marked boxes.</p>
                    {backToNumbers}
                  </>
                ) : (
                  <p role="status">Working out the three strategies</p>
                )
              }
            />
          )}
        </div>
      </section>
    </>
  )
}
