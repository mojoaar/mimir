'use client'

import { useActionState } from 'react'
import { requestResetAction, type ResetState } from './actions'

const FIELD = 'rounded-md border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-2'
const INITIAL: ResetState = { message: '' }

export type ResetLabels = { email: string; submit: string; pending: string }

export function ResetForm({ labels }: { labels: ResetLabels }) {
  const [state, formAction, pending] = useActionState(requestResetAction, INITIAL)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium">
        {labels.email}
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          autoFocus
          className={FIELD}
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-[var(--accent-fg)] disabled:opacity-60"
      >
        {pending ? labels.pending : labels.submit}
      </button>
      {state.message ? (
        <p className="text-sm text-[var(--text-muted)]" role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
