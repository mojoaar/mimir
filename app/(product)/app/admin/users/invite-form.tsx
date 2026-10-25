'use client'

import { useActionState } from 'react'
import { resendInviteAction, type ActionState } from './actions'

export function InviteForm({ userId, email }: { userId: string; email: string }) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(resendInviteAction, {})

  return (
    <div className="space-y-1">
      <form action={submit} className="inline">
        <input type="hidden" name="id" value={userId} />
        <input type="hidden" name="email" value={email} />
        <button
          type="submit"
          disabled={pending}
          className="rounded border border-[var(--border)] px-2 py-1 text-xs disabled:opacity-60"
        >
          {pending ? 'Sending…' : 'Resend invite'}
        </button>
      </form>

      {state.error && <p className="text-xs text-[var(--danger)]">{state.error}</p>}
      {state.ok && <p className="text-xs text-[var(--text-muted)]">{state.ok}</p>}
      {state.link && (
        <code className="block break-all text-xs text-[var(--text-muted)]">{state.link}</code>
      )}
    </div>
  )
}
