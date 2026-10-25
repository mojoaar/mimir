'use client'

import { useActionState } from 'react'
import { reembedAction, type ReembedFormState } from './actions'

const initial: ReembedFormState = {}

export type ReembedFormLabels = {
  note: string
  confirm: string
  submit: string
  pending: string
}

export function ReembedForm({ labels }: { labels: ReembedFormLabels }) {
  const [state, formAction, pending] = useActionState(reembedAction, initial)

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm text-[var(--text-muted)]">{labels.note}</p>
      {state.error ? <p className="text-sm text-[var(--danger)]">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-[var(--accent)]">{state.ok}</p> : null}
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="block text-[var(--text-muted)]">{labels.confirm}</span>
          <input
            name="confirm"
            autoComplete="off"
            className="w-40 rounded border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--danger)] disabled:opacity-60"
        >
          {pending ? labels.pending : labels.submit}
        </button>
      </div>
    </form>
  )
}
