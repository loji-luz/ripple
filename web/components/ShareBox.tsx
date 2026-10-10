'use client'

import { useState } from 'react'
import { api, ApiError, type ScenarioInput } from '@/lib/api'

/**
 * Saves the scenario and hands back a short link. This is the only thing in the app that
 * writes to the database, and it says so before the button is pressed.
 */
export function ShareBox({ input }: { input: ScenarioInput }) {
  const key = JSON.stringify(input)
  const [shared, setShared] = useState<{ key: string; url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // A link belongs to the numbers it was made from. Change a number and the offer comes back.
  const link = shared?.key === key ? shared.url : null

  const share = async () => {
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      const { code } = await api.share(input)
      setShared({ key, url: `${window.location.origin}/s/${code}` })
    } catch (problem) {
      const status = problem instanceof ApiError ? problem.status : 0
      setError(
        status === 429
          ? 'You have made several links in the last hour. Wait a while, then press Create share link again.'
          : status === 0
            ? "The link wasn't created because Ripple can't be reached. Check your connection and press Create share link again."
            : "The link wasn't created. Check the numbers above for anything highlighted, then press Create share link again.",
      )
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setError('Copying is blocked in this browser. Select the link and copy it yourself.')
    }
  }

  return (
    <section aria-label="Share this plan">
      {link ? (
        <>
          <p className="mt-1 text-[0.95rem] text-slate">
            Anyone with this link can see these numbers, as they are now. Later changes are not added to it. The link is removed after 12 months without being opened.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <label htmlFor="share-link" className="sr-only">
              Share link
            </label>
            <input id="share-link" className="field" type="text" readOnly value={link} onFocus={(event) => event.target.select()} />
            <button type="button" className="button button-primary shrink-0" onClick={copy}>
              Copy link
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[0.95rem] text-slate">Nothing is saved on Ripple until you create a link.</p>
          <button type="button" className="button button-primary mt-3" onClick={share} disabled={busy}>
            {busy ? 'Creating link' : 'Create share link'}
          </button>
        </>
      )}
      <p role="status" className="mt-2 text-[0.92rem]">
        {copied && link ? 'Link copied to the clipboard.' : ''}
      </p>
      {error && (
        <p role="alert" className="text-[0.92rem] text-error">
          <span className="font-bold">Fix: </span>
          {error}
        </p>
      )}
    </section>
  )
}
