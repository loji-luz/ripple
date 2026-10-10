'use client'

// The draft lives in this browser's localStorage and nowhere else. Nothing is sent to the
// database until Share is pressed. Replacing or clearing the draft keeps the old one so it can
// be put back with Undo.

import { useMemo, useSyncExternalStore } from 'react'
import { type Draft, parseDraft } from './draft'

const DRAFT_KEY = 'ripple.draft.v1'
const UNDO_KEY = 'ripple.undo.v1'

export interface Undo {
  /** What happened, as a sentence: "Loaded the example." */
  message: string
  /** The draft as it was before, or null if there was none. */
  previous: string | null
}

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // Storage is full or blocked: the form still works for this visit.
  }
  listeners.forEach((listener) => listener())
}

/** Saves an edit. */
export function saveDraft(draft: Draft) {
  write(DRAFT_KEY, JSON.stringify(draft))
}

/** Swaps the whole draft (or clears it with null) and remembers the old one for Undo. */
export function replaceDraft(draft: Draft | null, message: string) {
  const previous = read(DRAFT_KEY)
  write(UNDO_KEY, JSON.stringify({ message, previous } satisfies Undo))
  write(DRAFT_KEY, draft === null ? null : JSON.stringify(draft))
}

export function undoReplace() {
  const undo = parseUndo(read(UNDO_KEY))
  if (!undo) return
  write(DRAFT_KEY, undo.previous)
  write(UNDO_KEY, null)
}

export function dismissUndo() {
  write(UNDO_KEY, null)
}

function parseUndo(raw: string | null | undefined): Undo | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Undo
    return typeof value.message === 'string' ? value : null
  } catch {
    return null
  }
}

/**
 * The stored draft. `loaded` is false on the server and for the first paint in the browser,
 * so nothing flashes before storage has been read.
 */
export function useDraft(): { loaded: boolean; draft: Draft | null; undo: Undo | null } {
  const rawDraft = useSyncExternalStore(subscribe, () => read(DRAFT_KEY), () => undefined)
  const rawUndo = useSyncExternalStore(subscribe, () => read(UNDO_KEY), () => undefined)
  const draft = useMemo(() => parseDraft(rawDraft), [rawDraft])
  const undo = useMemo(() => parseUndo(rawUndo), [rawUndo])
  return { loaded: rawDraft !== undefined, draft, undo }
}

/** True at 768px and wider, where inputs and results sit side by side. False on the server. */
export function useIsWide(): boolean {
  return useSyncExternalStore(
    (listener) => {
      const query = window.matchMedia('(min-width: 768px)')
      query.addEventListener('change', listener)
      return () => query.removeEventListener('change', listener)
    },
    () => window.matchMedia('(min-width: 768px)').matches,
    () => false,
  )
}
