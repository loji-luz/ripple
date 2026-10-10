import { describe, expect, it } from 'vitest'
import { dollarsApart, duration, monthName, monthsApart, monthShort, parseAmount, percent, planMonth, startOfMonth, usd, usdShort, usdWhole } from './format'

describe('money', () => {
  it('always shows the currency and the cents', () => {
    expect(usd(0)).toBe('$0.00')
    expect(usd(1234.5)).toBe('$1,234.50')
    expect(usd(22.48)).toBe('$22.48')
    expect(usd(10_000_000)).toBe('$10,000,000.00')
  })

  it('drops cents only where they are noise', () => {
    expect(usdWhole(1234.56)).toBe('$1,235')
    expect(usdShort(0)).toBe('$0')
    expect(usdShort(800)).toBe('$800')
    expect(usdShort(1500)).toBe('$1.5k')
    expect(usdShort(20000)).toBe('$20k')
    expect(usdShort(2_500_000)).toBe('$2.5M')
  })

  it('writes percentages without trailing zeros', () => {
    expect(percent(22)).toBe('22%')
    expect(percent(5.5)).toBe('5.5%')
    expect(percent(21.47)).toBe('21.47%')
  })
})

describe('reading what was typed', () => {
  it.each([
    ['1250', 1250],
    ['1,250.50', 1250.5],
    ['$1,250.50', 1250.5],
    [' 22.5 % ', 22.5],
    ['.5', 0.5],
    ['0', 0],
  ])('reads %j as %d', (text, expected) => {
    expect(parseAmount(text)).toBe(expected)
  })

  it('tells an empty box from something that is not a number', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('   ')).toBeNull()
    for (const text of ['abc', '-5', '1.2.3', '.', '1e5', '12 apples']) expect(parseAmount(text)).toBeNaN()
  })
})

describe('months', () => {
  const start = startOfMonth(new Date(2026, 9, 8)) // 8 October 2026

  it('counts month 1 as the starting month', () => {
    expect(monthName(1, start)).toBe('October 2026')
    expect(monthName(4, start)).toBe('January 2027')
    expect(monthShort(15, start)).toBe('Dec 2027')
    expect(planMonth(3, start)).toEqual(new Date(2026, 11, 1))
  })

  it('writes a length of time in years and months', () => {
    expect(duration(1)).toBe('1 month')
    expect(duration(4)).toBe('4 months')
    expect(duration(12)).toBe('1 year')
    expect(duration(18)).toBe('1 year 6 months')
    expect(duration(25)).toBe('2 years 1 month')
    expect(duration(0)).toBe('0 months')
  })

  it('says how far apart two months are', () => {
    expect(monthsApart(10, 12)).toBe('2 months sooner')
    expect(monthsApart(13, 12)).toBe('1 month later')
    expect(monthsApart(30, 12)).toBe('1 year 6 months later')
    expect(monthsApart(12, 12)).toBe('the same month')
  })

  it('says how far apart two amounts are, without float noise', () => {
    expect(dollarsApart(460.5, 400)).toBe('$60.50 more')
    expect(dollarsApart(400, 460.5)).toBe('$60.50 less')
    expect(dollarsApart(0.1 + 0.2, 0.3)).toBe('the same')
  })
})
