'use client'

import { useActionState } from 'react'
import type { AuthUser } from '@/lib/auth/types'
import { updateProfileAction, type ActionState } from './actions'

const initial: ActionState = {}

export type ProfileLabels = {
  name: string
  email: string
  currentPassword: string
  currentPasswordHint: string
  save: string
  saving: string
}

const field =
  'rounded border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-2 text-[var(--fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'

export function ProfileForm({ user, labels }: { user: AuthUser; labels: ProfileLabels }) {
  const [state, action, pending] = useActionState(updateProfileAction, initial)

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span>{labels.name}</span>
        <input name="name" defaultValue={user.name} required maxLength={200} className={field} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span>{labels.email}</span>
        <input
          name="email"
          type="email"
          defaultValue={user.email}
          required
          autoComplete="email"
          className={field}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span>{labels.currentPassword}</span>
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          className={field}
        />
        <span className="text-xs text-[var(--text-muted)]">{labels.currentPasswordHint}</span>
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--accent-fg)] disabled:opacity-60"
        >
          {pending ? labels.saving : labels.save}
        </button>
        {state.error ? <span role="alert" className="text-sm text-[var(--danger)]">{state.error}</span> : null}
        {state.ok ? <span className="text-sm text-[var(--text-muted)]">{state.ok}</span> : null}
      </div>
    </form>
  )
}
