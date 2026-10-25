'use client'

import { useActionState } from 'react'
import { createUserAction, type ActionState } from './actions'

export function UserForm() {
  const [state, submit, pending] = useActionState<ActionState, FormData>(createUserAction, {})

  return (
    <form action={submit} className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[var(--text-muted)]">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="off"
            className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[var(--text-muted)]">Name</span>
          <input
            name="name"
            required
            autoComplete="off"
            className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[var(--text-muted)]">Role</span>
          <select
            name="role"
            defaultValue="user"
            className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[var(--text-muted)]">Password (optional)</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-[var(--accent)] px-3 py-1.5 font-medium text-[var(--accent-fg)] disabled:opacity-60"
      >
        {pending ? 'Creating…' : 'Create user'}
      </button>

      {state.error && <p className="text-[var(--danger)]">{state.error}</p>}
      {state.ok && <p className="text-[var(--text-muted)]">{state.ok}</p>}
      {state.link && (
        <div className="space-y-1">
          <p className="text-[var(--text-muted)]">
            Email is not configured — send this link yourself.
          </p>
          <code className="block break-all rounded border border-[var(--border)] bg-[var(--bg-sunken)] p-2 text-xs">
            {state.link}
          </code>
        </div>
      )}
    </form>
  )
}
