'use client'

import { useActionState } from 'react'
import { changePasswordAction, type ActionState } from './actions'

const initial: ActionState = {}

export type PasswordLabels = {
  currentPassword: string
  newPassword: string
  confirmPassword: string
  passwordHint: string
  changePassword: string
  changing: string
}

const field =
  'rounded border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-2 text-[var(--fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'

export function PasswordForm({ labels }: { labels: PasswordLabels }) {
  const [state, action, pending] = useActionState(changePasswordAction, initial)

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span>{labels.currentPassword}</span>
        <input
          name="current"
          type="password"
          required
          autoComplete="current-password"
          className={field}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span>{labels.newPassword}</span>
        <input
          name="new"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className={field}
        />
        <span className="text-xs text-[var(--text-muted)]">{labels.passwordHint}</span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span>{labels.confirmPassword}</span>
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
          {pending ? labels.changing : labels.changePassword}
        </button>
        {state.error ? <span role="alert" className="text-sm text-[var(--danger)]">{state.error}</span> : null}
        {state.ok ? <span className="text-sm text-[var(--text-muted)]">{state.ok}</span> : null}
      </div>
    </form>
  )
}
