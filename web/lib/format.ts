// How numbers and dates are written. Every amount carries its currency and every month its year.

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const wholeDollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

/** $1,234.50 */
export function usd(amount: number): string {
  return dollars.format(amount)
}

/** $1,235: for chart axes, where cents are noise. */
export function usdWhole(amount: number): string {
  return wholeDollars.format(amount)
}

/** $20k, $1.5k, $800: axis ticks. */
export function usdShort(amount: number): string {
  if (amount >= 1_000_000) return `$${trim(amount / 1_000_000)}M`
  if (amount >= 1000) return `$${trim(amount / 1000)}k`
  return `$${trim(amount)}`
}

function trim(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '')
}

/** 22.5% */
export function percent(value: number): string {
  return `${Number(value.toFixed(2))}%`
}

/**
 * Reads what someone typed into a money or percentage box. Accepts "$1,250.50", "1250" and
 * " 22.5 % ". Returns null for an empty box and NaN for anything that is not a plain
 * non-negative number, so the caller can tell "nothing yet" from "not a number".
 */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[$,%\s]/g, '')
  if (cleaned === '') return null
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '.') return NaN
  return Number(cleaned)
}

/** The first day of the month a date falls in. Month 1 of a plan is this month. */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

/** The calendar month a plan month falls in. Month 1 is the starting month itself. */
export function planMonth(month: number, start: Date): Date {
  return new Date(start.getFullYear(), start.getMonth() + month - 1, 1)
}

const longMonth = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })
const shortMonth = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' })

/** "March 2028" */
export function monthName(month: number, start: Date): string {
  return longMonth.format(planMonth(month, start))
}

/** "Mar 2028" */
export function monthShort(month: number, start: Date): string {
  return shortMonth.format(planMonth(month, start))
}

/** "1 year 6 months", "4 months", "2 years". */
export function duration(months: number): string {
  const years = Math.floor(months / 12)
  const rest = months % 12
  const parts = []
  if (years > 0) parts.push(years === 1 ? '1 year' : `${years} years`)
  if (rest > 0 || years === 0) parts.push(rest === 1 ? '1 month' : `${rest} months`)
  return parts.join(' ')
}

/** "3 months sooner", "1 month later", or "the same month". */
export function monthsApart(month: number, other: number): string {
  if (month === other) return 'the same month'
  const gap = Math.abs(month - other)
  return `${duration(gap)} ${month < other ? 'sooner' : 'later'}`
}

/** "$60.50 more", "$12.00 less", or "the same". */
export function dollarsApart(amount: number, other: number): string {
  const gap = Math.round((amount - other) * 100) / 100
  if (gap === 0) return 'the same'
  return `${usd(Math.abs(gap))} ${gap > 0 ? 'more' : 'less'}`
}
