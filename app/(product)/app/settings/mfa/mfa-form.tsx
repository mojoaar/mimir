'use client'

import { useActionState } from 'react'
import { confirmMfaAction, type MfaState } from './actions'

const FIELD =
  'rounded-md border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-2 font-normal text-[var(--fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'

export type ConfirmLabels = { codeLabel: string; checking: string; turnOn: string }

export function ConfirmForm({ labels }: { labels: ConfirmLabels }) {
  const [state, action, pending] = useActionState<MfaState, FormData>(confirmMfaAction, {})

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium">
        {labels.codeLabel}
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          className={FIELD}
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-[var(--accent-fg)] disabled:opacity-60"
        >
          {pending ? labels.checking : labels.turnOn}
        </button>
        {state.error ? <span role="alert" className="text-sm text-[var(--danger)]">{state.error}</span> : null}
        {state.ok ? <span className="text-sm text-[var(--text-muted)]">{state.ok}</span> : null}
      </div>
    </form>
  )
}
