'use client'

import { useEffect, useState } from 'react'
import { api, ApiError, type ScenarioInput, type Simulation } from './api'

// Answers already worked out, by request. Dragging the slider back to where it was costs nothing.
type Answer = { ok: true; data: Simulation } | { ok: false; error: ApiError }
const answers = new Map<string, Answer>()
const MAX_ANSWERS = 200

function remember(key: string, answer: Answer) {
  if (answers.size >= MAX_ANSWERS) answers.delete(answers.keys().next().value as string)
  answers.set(key, answer)
}

export interface SimulationState {
  /** The comparison for exactly what is in the form now. */
  data: Simulation | null
  /** The last comparison worked out, kept on screen while a newer one is on its way. */
  shown: Simulation | null
  /** True while `shown` is older than the form. */
  updating: boolean
  /** Messages from the API by request path ("monthlyBudget", "debts[0].apr"). */
  fields: Record<string, string>
  /** A named engine error: "BudgetBelowMinimums", "DebtNeverClears" or "TooLong". */
  code: string | null
  /** Something to tell the person that is not about one field: offline, or asked to slow down. */
  notice: string | null
  retry: () => void
}

/**
 * Keeps the comparison in step with the form. There is no Calculate button: a change is sent
 * once typing has paused for `delay` milliseconds, and a newer change cancels an older request.
 * If the API asks for a pause (429) the request is sent again when the pause is over.
 */
export function useSimulation(input: ScenarioInput | null, delay = 350): SimulationState {
  const key = input ? JSON.stringify(input) : null
  const [last, setLast] = useState<Simulation | null>(null)
  const [notice, setNotice] = useState<{ key: string; message: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!key || answers.has(key)) return
    const controller = new AbortController()
    let again: ReturnType<typeof setTimeout> | undefined

    const run = async () => {
      try {
        const data = await api.simulate(JSON.parse(key) as ScenarioInput, controller.signal)
        remember(key, { ok: true, data })
        setNotice(null)
      } catch (error) {
        if (controller.signal.aborted) return
        const problem = error instanceof ApiError ? error : new ApiError(0, 'Something went wrong. Try again.')
        if (problem.status === 429) {
          setNotice({ key, message: problem.message })
          again = setTimeout(run, (problem.retryAfter ?? 60) * 1000)
        } else if (problem.status === 400 || problem.status === 422) {
          // The input is the problem. Asking again would give the same answer.
          remember(key, { ok: false, error: problem })
          setNotice(null)
        } else {
          setNotice({ key, message: problem.message })
        }
      }
      setTick((n) => n + 1)
    }

    const timer = setTimeout(run, delay)
    return () => {
      clearTimeout(timer)
      clearTimeout(again)
      controller.abort()
    }
  }, [key, delay, attempt])

  const answer = key ? answers.get(key) : undefined
  const data = answer?.ok ? answer.data : null
  const refused = answer && !answer.ok ? answer.error : null
  // Remember the newest comparison, including one that came straight from memory.
  if (data && data !== last) setLast(data)
  return {
    data,
    shown: data ?? (refused ? null : last),
    updating: key !== null && !answer,
    fields: refused?.fields ?? {},
    code: refused?.code ?? null,
    notice: notice && notice.key === key ? notice.message : null,
    retry: () => setAttempt((n) => n + 1),
  }
}
