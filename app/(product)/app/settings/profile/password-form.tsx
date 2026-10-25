'use client'

import { useActionState } from 'react'
import { changePasswordAction, type ActionState } from './actions'

const initial: ActionState = {}

const field =
  'rounded border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-2 text-[var(--fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initial)

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span>Current password</span>
        <input
          name="current"
          type="password"
          required
          autoComplete="current-password"
          className={field}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span>New password</span>
        <input
          name="new"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className={field}
        />
        <span className="text-xs text-[var(--text-muted)]">At least 12 characters.</span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span>Confirm new password</span>
        <input
          name="confirm"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className={field}
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--accent-fg)] disabled:opacity-60"
        >
          {pending ? 'Changing…' : 'Change password'}
        </button>
        {state.error ? <span role="alert" className="text-sm text-[var(--danger)]">{state.error}</span> : null}
        {state.ok ? <span className="text-sm text-[var(--text-muted)]">{state.ok}</span> : null}
      </div>
    </form>
  )
}
