'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'

/**
 * A definition or a tip behind a small "?" button, so the screen stays quiet until someone
 * wants it. It opens on hover, on keyboard focus and on tap; Escape closes it; it follows its button when the page scrolls; the pointer can
 * move onto it to read or select the text. It is placed with fixed coordinates so a table's
 * clipped edge never cuts it off.
 */
export function Hint({ about, children, className = '' }: { about: string; children: string; className?: string }) {
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [place, setPlace] = useState({ top: 0, left: 0 })
  const WIDTH = 272

  const show = useCallback(() => {
    const box = button.current?.getBoundingClientRect()
    if (!box) return
    const left = Math.max(8, Math.min(box.left + box.width / 2 - WIDTH / 2, window.innerWidth - WIDTH - 8))
    setPlace({ top: box.bottom + 6, left })
    setOpen(true)
  }, [])
  const hide = useCallback(() => {
    setOpen(false)
    setPinned(false)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && hide()
    const onPointer = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(`[data-hint="${id}"]`)) hide()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', show, true)
    window.addEventListener('resize', hide)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', show, true)
      window.removeEventListener('resize', hide)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open, hide, show, id])

  return (
    <span data-hint={id} className={`inline-flex align-middle ${className}`} onMouseEnter={show} onMouseLeave={() => !pinned && setOpen(false)}>
      <button
        ref={button}
        type="button"
        className="hint-button"
        aria-label={`About ${about}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onFocus={show}
        onBlur={() => !pinned && setOpen(false)}
        onClick={() => {
          if (open && pinned) hide()
          else {
            setPinned(true)
            show()
          }
        }}
      >
        <span aria-hidden="true">?</span>
      </button>
      {open && (
        <span id={id} role="tooltip" className="hint-bubble" style={{ top: place.top, left: place.left, width: WIDTH }}>
          {children}
        </span>
      )}
    </span>
  )
}
