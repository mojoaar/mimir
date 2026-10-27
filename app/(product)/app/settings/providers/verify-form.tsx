'use client'

import { useActionState } from 'react'
import { verifyProviderAction, type VerifyState } from './actions'

const initial: VerifyState = {}

/**
 * A probe takes up to fifteen seconds. Without a pending state and an outcome
 * the row looked untouched, so a working test read as a dead button.
 */
export function VerifyForm({
  id,
  label,
  className,
  labels,
}: {
  id: string
  label: string
  className: string
  labels: { testing: string; ok: string; okDim: string; failed: string }
}) {
  const [state, action, pending] = useActionState(verifyProviderAction, initial)

  const result = state.ok
    ? state.dim
      ? labels.okDim.replace('{dim}', String(state.dim))
      : labels.ok
    : null

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className={className} aria-busy={pending}>
        {pending ? labels.testing : label}
      </button>
      {result && <span className="text-xs text-[var(--accent)]">{result}</span>}
      {state.ok === false && state.error && (
        <span role="alert" className="text-xs text-[var(--danger)]">
          {labels.failed.replace('{message}', state.error)}
        </span>
      )}
    </form>
  )
}
