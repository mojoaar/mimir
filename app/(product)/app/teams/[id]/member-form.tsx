'use client'

import { useActionState } from 'react'

import { addMemberAction, type ActionState } from '../actions'

export type MemberFormLabels = {
  heading: string
  hint: string
  submit: string
  pending: string
}

export function MemberForm({
  teamId,
  labels,
}: {
  teamId: string
  labels: MemberFormLabels
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addMemberAction, {})

  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] p-4"
    >
      <input type="hidden" name="teamId" value={teamId} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{labels.heading}</span>
        <input
          name="email"
          type="email"
          required
          placeholder="teammate@example.test"
          className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5"
        />
      </label>
      <p className="text-sm text-[var(--text-muted)]">{labels.hint}</p>
      {state.error ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <p className="text-sm text-[var(--text-muted)]">{state.ok}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent-fg)] disabled:opacity-60"
      >
        {pending ? labels.pending : labels.submit}
      </button>
    </form>
  )
}
