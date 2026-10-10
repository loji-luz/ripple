import type { StrategyId, StrategyResult } from './api'
import { colors } from './colors'

/** How each strategy is drawn and described. The colour follows the strategy, never its rank. */
export const strategyStyle: Record<StrategyId, { color: string; dash: string | undefined; cap: 'butt' | 'round'; how: string; line: string }> = {
  HighestInterestFirst: {
    color: colors.seriesAvalanche,
    dash: undefined,
    cap: 'butt',
    how: 'Every extra dollar goes to the debt with the highest APR.',
    line: 'solid line',
  },
  SmallestDebtFirst: {
    color: colors.seriesSnowball,
    dash: '9 5',
    cap: 'butt',
    how: 'Every extra dollar goes to the debt with the smallest balance.',
    line: 'dashed line',
  },
  HalfAndHalf: {
    color: colors.seriesHalf,
    dash: '1 6',
    cap: 'round',
    how: 'Half the extra goes to savings until the fund is full, the rest to the highest APR.',
    line: 'dotted line',
  },
}

/** Remaining debt at the end of a month. Month 0 is the starting total. */
export function balanceAt(strategy: StrategyResult, month: number, totalDebt: number, open = false): number {
  if (month <= 0) return totalDebt
  // An open line is a projection that does not reach zero: every month has its own balance.
  if (!open && month >= strategy.debtFreeMonth) return 0
  return strategy.months[month - 1]?.debtBalance ?? 0
}

/** True when two strategies give exactly the same plan, so their lines sit on top of each other. */
export function samePlan(a: StrategyResult, b: StrategyResult): boolean {
  return (
    a.debtFreeMonth === b.debtFreeMonth &&
    a.fundReachedMonth === b.fundReachedMonth &&
    a.totalInterest === b.totalInterest &&
    a.months.every((month, i) => month.debtBalance === b.months[i]?.debtBalance)
  )
}

/** A round number at or above the largest value, and the step between gridlines. */
export function niceScale(max: number, targetSteps = 5): { top: number; step: number } {
  if (max <= 0) return { top: 1, step: 1 }
  const rough = max / targetSteps
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= rough) ?? 10 * magnitude
  return { top: Math.ceil(max / step) * step, step }
}

/** Which months get a label on the time axis: a whole number of months apart, at most `maxTicks` of them. */
export function monthTicks(lastMonth: number, maxTicks: number): number[] {
  const step = [1, 2, 3, 6, 12, 24, 36, 60, 120].find((candidate) => lastMonth / candidate <= maxTicks - 1) ?? 120
  const ticks = []
  for (let month = 0; month <= lastMonth; month += step) ticks.push(month)
  return ticks
}
