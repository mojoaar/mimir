'use client'

import { useActionState } from 'react'
import { resetPasswordAction, type ActionState } from './actions'

export function ResetForm({ userId, email }: { userId: string; email: string }) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(resetPasswordAction, {})

  return (
    <div className="space-y-1">
      <form action={submit} className="inline">
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="email" value={email} />
        <button
          type="submit"
          disabled={pending}
          className="rounded border border-[var(--border)] px-2 py-1 text-xs disabled:opacity-60"
        >
          {pending ? 'Sending…' : 'Send reset'}
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
