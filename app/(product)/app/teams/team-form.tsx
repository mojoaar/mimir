'use client'

import { useActionState } from 'react'

import { createTeamAction, type ActionState } from './actions'

export function TeamForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createTeamAction, {})

  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] p-4"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">New team</span>
        <input
          name="name"
          required
          maxLength={80}
          placeholder="Platform"
          className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5"
        />
      </label>
      <p className="text-sm text-[var(--text-muted)]">
        A team shares projects. Being on a team never makes anyone the owner of one.
      </p>
      {state.error ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent-fg)] disabled:opacity-60"
      >
        {pending ? 'Creating…' : 'Create team'}
      </button>
    </form>
  )
}
