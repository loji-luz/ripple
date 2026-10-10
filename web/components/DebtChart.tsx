'use client'

import { useEffect, useRef, useState } from 'react'
import type { Simulation, StrategyResult } from '@/lib/api'
import { colors } from '@/lib/colors'
import { monthName, monthShort, usd, usdShort } from '@/lib/format'
import { balanceAt, monthTicks, niceScale, samePlan, strategyStyle } from '@/lib/strategies'

// The chart grows and shrinks with the window, so the whole comparison fits one screen where it
// can: the window's height less the header, the panel's bar, the slider and the legend.
const MIN_HEIGHT = 300
const MAX_HEIGHT = 760
const AROUND_THE_CHART = 440
const heightFor = (windowHeight: number) => Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, windowHeight - AROUND_THE_CHART))
// Room on the left and at the bottom for the tick labels and the title of each axis.
const MARGIN = { top: 14, right: 18, bottom: 62, left: 78 }

/** The height the chart takes at this window size. The table uses it too, so swapping the two does not move the page. */
export function useChartHeight(): number {
  const [height, setHeight] = useState(420)
  useEffect(() => {
    const fit = () => setHeight(heightFor(window.innerHeight))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  return height
}

/** A short sample of a strategy's line, for the legend. */
function LineSample({ strategy }: { strategy: StrategyResult }) {
  const style = strategyStyle[strategy.strategy]
  return (
    <svg width="40" height="12" viewBox="0 0 40 12" aria-hidden="true" focusable="false" className="shrink-0">
      <line x1="1" y1="6" x2="39" y2="6" stroke={style.color} strokeWidth="3" strokeDasharray={style.dash} strokeLinecap={style.cap} />
    </svg>
  )
}

/**
 * Remaining debt by month, one line per strategy. Each line has its own colour and its own
 * dash pattern, and a dot where the debt reaches zero. Pointing at the chart reads out one
 * month; the table beside it carries every number for people who do not use a pointer.
 */
export function DebtChart({ simulation, start, highlight, open = false }: { simulation: Simulation; start: Date; highlight?: string; open?: boolean }) {
  const frame = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const height = useChartHeight()
  const [pointed, setPointed] = useState<number | null>(null)

  useEffect(() => {
    const element = frame.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const { strategies, totalDebt } = simulation
  const lastMonth = Math.max(1, ...strategies.map((s) => s.debtFreeMonth))
  // A projection that does not clear can climb above where it started.
  const { top, step } = niceScale(open ? Math.max(totalDebt, ...strategies.flatMap((s) => s.months.map((m) => m.debtBalance))) : totalDebt)
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right)
  const plotHeight = height - MARGIN.top - MARGIN.bottom
  const x = (month: number) => MARGIN.left + (month / lastMonth) * plotWidth
  const y = (amount: number) => MARGIN.top + (1 - amount / top) * plotHeight
  const ticks = monthTicks(lastMonth, width < 520 ? 4 : 7)
  const month = pointed === null ? null : Math.min(pointed, lastMonth)

  // Strategies that give exactly the same plan share one line, so they are drawn once and the
  // legend names them together. Otherwise three dash patterns pile up and read as one odd line.
  const lines: StrategyResult[][] = []
  for (const strategy of strategies) {
    const group = lines.find(([first]) => samePlan(first, strategy))
    if (group) group.push(strategy)
    else lines.push([strategy])
  }
  const named = (group: StrategyResult[]) =>
    group.length === strategies.length && group.length > 1
      ? `All ${group.length} strategies: the same with these numbers`
      : group.length > 1
        ? `${group.map((g) => g.label).join(' and ')}: the same with these numbers`
        : group[0].label

  const picked = (group: StrategyResult[]) => group.some((g) => g.strategy === highlight)

  const point = (clientX: number, element: SVGRectElement) => {
    const box = element.getBoundingClientRect()
    setPointed(Math.round(((clientX - box.left) / box.width) * lastMonth))
  }

  return (
    <div>
      <div ref={frame} className="w-full">
        {width > 0 && (
          <svg
            className="chart block"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={
              open
                ? `Line chart of debt by month at the current payment, in US dollars, from ${usd(totalDebt)} today to ${usd(balanceAt(strategies[0], lastMonth, totalDebt, true))} in ${monthName(lastMonth, start)}. It does not reach zero. The table view has every number.`
                : `Line chart of remaining debt by month, in US dollars, from ${usd(totalDebt)} today. ${strategies
                    .map((s) => `${s.label} reaches zero in ${monthName(s.debtFreeMonth, start)}`)
                    .join('. ')}. The table view has every number.`
            }
          >
            {/* Gridlines and the dollar axis. */}
            {Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).map((amount) => (
              <g key={amount}>
                <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(amount)} y2={y(amount)} stroke={amount === 0 ? colors.slate : colors.line} strokeWidth="1" />
                <text x={MARGIN.left - 8} y={y(amount)} textAnchor="end" dominantBaseline="middle">
                  {usdShort(amount)}
                </text>
              </g>
            ))}

            {/* The time axis. */}
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={x(tick)} x2={x(tick)} y1={y(0)} y2={y(0) + 5} stroke={colors.slate} strokeWidth="1" />
                <text x={x(tick)} y={y(0) + 21} textAnchor={tick === 0 ? 'start' : x(tick) > width - 44 ? 'end' : 'middle'}>
                  {tick === 0 ? 'Today' : monthShort(tick, start)}
                </text>
              </g>
            ))}

            {/* What each axis measures. */}
            <text className="axis-title" x={MARGIN.left + plotWidth / 2} y={height - 10} textAnchor="middle">
              Month
            </text>
            <text className="axis-title" transform={`translate(16 ${MARGIN.top + plotHeight / 2}) rotate(-90)`} textAnchor="middle">
              Remaining debt (USD)
            </text>

            {/* One line per strategy, stopping where its debt reaches zero. */}
            {[...lines]
              // The picked-out line is drawn last, so it sits on top.
              .sort((a, b) => Number(picked(a)) - Number(picked(b)))
              .map((group) => {
              const strategy = group[0]
              const style = strategyStyle[strategy.strategy]
              const points = Array.from({ length: strategy.debtFreeMonth + 1 }, (_, m) => `${x(m).toFixed(1)},${y(balanceAt(strategy, m, totalDebt, open)).toFixed(1)}`)
              return (
                <polyline
                  key={strategy.strategy}
                  points={points.join(' ')}
                  fill="none"
                  stroke={style.color}
                  data-line={group.map((g) => g.strategy).join(' ')}
                  data-picked={picked(group) ? 'true' : undefined}
                  strokeWidth={picked(group) ? 4.5 : 2.5}
                  opacity={highlight && !picked(group) ? 0.4 : 1}
                  strokeDasharray={style.dash}
                  strokeLinecap={style.cap}
                  strokeLinejoin="round"
                />
              )
            })}
            {!open && strategies.map((strategy) => (
              <circle
                key={strategy.strategy}
                data-testid={`payoff-${strategy.strategy}`}
                data-month={strategy.debtFreeMonth}
                cx={x(strategy.debtFreeMonth)}
                cy={y(0)}
                r="5"
                fill={strategyStyle[strategy.strategy].color}
                stroke={colors.paper}
                strokeWidth="2"
              />
            ))}

            {/* The month being pointed at. */}
            {month !== null && (
              <g>
                <line x1={x(month)} x2={x(month)} y1={MARGIN.top} y2={y(0)} stroke={colors.ink} strokeWidth="1" />
                {strategies.map((strategy) => (
                  <circle
                    key={strategy.strategy}
                    cx={x(month)}
                    cy={y(balanceAt(strategy, month, totalDebt, open))}
                    r="4.5"
                    fill={strategyStyle[strategy.strategy].color}
                    stroke={colors.paper}
                    strokeWidth="2"
                  />
                ))}
              </g>
            )}
            <rect
              data-testid="chart-plot"
              x={MARGIN.left}
              y={MARGIN.top}
              width={plotWidth}
              height={plotHeight}
              fill="transparent"
              style={{ touchAction: 'pan-y' }}
              onPointerMove={(event) => point(event.clientX, event.currentTarget)}
              onPointerDown={(event) => point(event.clientX, event.currentTarget)}
              onPointerLeave={(event) => event.pointerType === 'mouse' && setPointed(null)}
            />
          </svg>
        )}
      </div>

      <p className="mt-1 min-h-[3.2rem] text-[0.92rem] sm:min-h-[1.6rem]" data-testid="chart-readout" aria-hidden="true">
        {month !== null && (
          <>
            <strong className="font-bold">{month === 0 ? 'Today' : `End of ${monthName(month, start)}`}:</strong>{' '}
            {strategies.map((s, i) => (
              <span key={s.strategy} className="money whitespace-normal">
                {i > 0 && ' · '}
                {s.label} {usd(balanceAt(s, month, totalDebt, open))}
              </span>
            ))}
          </>
        )}
      </p>

      <ul className="flex flex-col gap-1 border-t border-line pt-3 text-[0.92rem] sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-6" aria-label="Legend">
        {lines.map((group) => (
          <li key={group[0].strategy} className="flex items-center gap-2">
            <LineSample strategy={group[0]} />
            <span className={picked(group) ? 'font-bold' : ''}>
              {named(group)}
              {picked(group) && lines.length > 1 && <span className="font-normal text-slate"> (on the card)</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
