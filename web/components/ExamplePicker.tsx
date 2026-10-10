'use client'

import { useEffect, useState } from 'react'
import { api, type Example } from '@/lib/api'
import { usd } from '@/lib/format'
import { Badge } from './ui'

/**
 * The starting point: example households to open instead of an empty form. Each card says
 * where its numbers come from, and which of them are assumptions.
 */
export function ExamplePicker({ onPick }: { onPick: (example: Example) => void }) {
  const [examples, setExamples] = useState<Example[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let current = true
    api
      .examples()
      .then((loaded) => {
        if (!current) return
        setExamples(loaded)
        setFailed(false)
      })
      .catch(() => current && setFailed(true))
    return () => {
      current = false
    }
  }, [attempt])

  if (failed) {
    return (
      <div className="rounded-md border border-slate bg-paper px-4 py-4">
        <p>
          <Badge tone="error">Not loaded</Badge> <span className="ml-1">The examples could not be loaded. Try again, or start with your own numbers below.</span>
        </p>
        <button type="button" className="button mt-3" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </button>
      </div>
    )
  }

  if (!examples) {
    return (
      <p role="status" className="text-slate">
        Loading the examples
      </p>
    )
  }

  return (
    <ul className="grid gap-4 md:grid-cols-3">
      {examples.map((example) => {
        const debts = example.input.debts
        const owed = debts.reduce((sum, debt) => sum + (debt.balance ?? 0), 0)
        return (
          <li key={example.slug} className="flex flex-col rounded-md border border-slate bg-paper">
            <div className="flex flex-1 flex-col gap-3 px-4 py-4">
              <div>
                <Badge tone={example.illustrative ? 'warning' : 'info'}>{example.illustrative ? 'Illustrative example, not real data' : 'Based on survey medians'}</Badge>
                <h3 className="mt-2 text-[1.15rem]">{example.title}</h3>
                <p className="mt-1 text-[0.95rem]">{example.summary}</p>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-y border-line py-3 text-[0.95rem]">
                <dt className="text-slate">Owes</dt>
                <dd className="money text-right font-bold whitespace-normal">
                  {usd(owed)} across {debts.length} {debts.length === 1 ? 'debt' : 'debts'}
                </dd>
                <dt className="text-slate">Has saved</dt>
                <dd className="money text-right font-bold">{usd(example.input.savings ?? 0)}</dd>
                <dt className="text-slate">Can put in</dt>
                <dd className="money text-right font-bold">{usd(example.input.monthlyBudget ?? 0)} a month</dd>
              </dl>
              <p className="text-[0.85rem] leading-snug text-slate">{example.source}</p>
            </div>
            <div className="border-t border-line px-4 py-3">
              <button type="button" className="button button-primary w-full" onClick={() => onPick(example)} aria-label={`Use this example: ${example.title}`}>
                Use this example
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
