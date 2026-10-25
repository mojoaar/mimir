'use client'

import { useActionState } from 'react'
import type { AuthUser } from '@/lib/auth/types'
import { updateProfileAction, type ActionState } from './actions'

const initial: ActionState = {}

const field =
  'rounded border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-2 text-[var(--fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'

export function ProfileForm({ user }: { user: AuthUser }) {
  const [state, action, pending] = useActionState(updateProfileAction, initial)

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span>Name</span>
        <input name="name" defaultValue={user.name} required maxLength={200} className={field} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span>Email</span>
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
        <span>Current password</span>
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          className={field}
        />
        <span className="text-xs text-[var(--text-muted)]">
          Only needed when you change the email address. It is also how you sign in.
        </span>
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--accent-fg)] disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        {state.error ? <span className="text-sm text-[var(--danger)]">{state.error}</span> : null}
        {state.ok ? <span className="text-sm text-[var(--text-muted)]">{state.ok}</span> : null}
      </div>
    </form>
  )
}
