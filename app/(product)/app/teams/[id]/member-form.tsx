'use client'

import { useActionState } from 'react'

import { addMemberAction, type ActionState } from '../actions'

export function MemberForm({ teamId }: { teamId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addMemberAction, {})

  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] p-4"
    >
      <input type="hidden" name="teamId" value={teamId} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Add member</span>
        <input
          name="email"
          type="email"
          required
          placeholder="teammate@example.test"
          className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5"
        />
      </label>
      <p className="text-sm text-[var(--text-muted)]">
        They must already have an active account. Their access starts on their next request.
      </p>
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
        {pending ? 'Adding…' : 'Add member'}
      </button>
    </form>
  )
}
