'use client'

import { type ReactNode, useId, useState } from 'react'

/** A section that stays folded until asked for: the detail is there, but not in the way. */
export function Disclosure({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const id = useId()
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="border-t border-line">
      <h3>
        <button type="button" className="disclosure" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
          {title}
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false" className={open ? 'rotate-180' : ''}>
            <path d="M2 5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </h3>
      <div id={id} hidden={!open} className="pb-5">
        {open && children}
      </div>
    </section>
  )
}
