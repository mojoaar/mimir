'use client'

import { useActionState } from 'react'

import { renameTeamAction, type ActionState } from '../actions'

const FIELD =
  'rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm outline-none focus-visible:outline-2 focus-visible:outline-[var(--accent)]'

export function RenameForm({ teamId, name }: { teamId: string; name: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(renameTeamAction, {})

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] p-4">
      <h2 className="text-sm font-semibold">Team name</h2>
      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="teamId" value={teamId} />
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-[var(--text-muted)]">Name</span>
          <input name="name" defaultValue={name} maxLength={80} className={FIELD} />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent-fg)] disabled:opacity-60"
        >
          {pending ? 'Renaming…' : 'Rename'}
        </button>
      </form>
      {state.error ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <p className="text-sm text-[var(--text-muted)]">{state.ok}</p> : null}
    </section>
  )
}
