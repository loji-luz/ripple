import type { ReactNode } from 'react'
import { Hint } from './Hint'

/** The emblem: a drop and the rings it sends out. Drawn here so there is no image to load. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" strokeWidth="1.75" opacity="0.75" />
      <circle cx="16" cy="16" r="3.75" className="fill-warning" />
    </svg>
  )
}

const tones = {
  recommended: 'bg-success text-paper',
  info: 'bg-slate text-paper',
  warning: 'bg-warning text-ink',
  error: 'bg-error text-paper',
  neutral: 'bg-paper text-slate border border-slate',
} as const

/** A status or tag. Always words, with colour as a second cue. */
export function Badge({ tone, children }: { tone: keyof typeof tones; children: ReactNode }) {
  return <span className={`badge ${tones[tone]}`}>{children}</span>
}

/** What is wrong with a field and what to do, tied to the field with aria-describedby. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="mt-1 text-[0.88rem] leading-snug text-error">
      <span className="font-bold">Fix: </span>
      {message}
    </p>
  )
}

interface AmountFieldProps {
  id: string
  label: ReactNode
  /** Shown inside the box: "$" before the number or "%" after it. */
  unit: '$' | '%'
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  error?: string
  hint?: ReactNode
  /** A definition behind a "?" beside the label: what it is about, and the text. */
  help?: { about: string; text: string }
  /** In a table the column header is the visible label from 768px up. */
  labelHiddenWhenWide?: boolean
}

/**
 * A box for money or a percentage. It is a text box with a numeric keypad rather than
 * type="number", so "1,250.50" can be typed as it is written and nothing changes on scroll.
 */
export function AmountField({ id, label, unit, value, onChange, onBlur, error, hint, help, labelHiddenWhenWide }: AmountFieldProps) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined
  return (
    <div>
      <div className={`flex items-center gap-1.5 ${labelHiddenWhenWide ? 'max-md:mb-1' : 'mb-1'}`}>
        <label htmlFor={id} className={`block text-[0.92rem] ${labelHiddenWhenWide ? 'md:sr-only' : ''}`}>
          {label}
        </label>
        {help && (
          <Hint about={help.about} className={labelHiddenWhenWide ? 'md:hidden' : ''}>
            {help.text}
          </Hint>
        )}
      </div>
      <div className="relative">
        <span aria-hidden="true" className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate ${unit === '$' ? 'left-2.5' : 'right-2.5'}`}>
          {unit}
        </span>
        <input
          id={id}
          className={`field text-right ${unit === '$' ? 'pl-6' : 'pr-7'}`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-[0.88rem] leading-snug text-slate">
          {hint}
        </p>
      )}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  )
}

/** A section inside a panel: a header, then content, divided from the section above. */
export function Section({ title, aside, children, first }: { title: string; aside?: ReactNode; children: ReactNode; first?: boolean }) {
  return (
    <section className={first ? '' : 'border-t border-line pt-5'}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h3 className="text-[1.05rem]">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}
