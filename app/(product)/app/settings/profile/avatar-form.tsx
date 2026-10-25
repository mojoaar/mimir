'use client'

import { useActionState } from 'react'
import { uploadAvatarAction, type AvatarState } from './actions'

export type AvatarFormLabels = { hint: string; submit: string; pending: string }

export function AvatarForm({ labels }: { labels: AvatarFormLabels }) {
  const [state, action, pending] = useActionState<AvatarState, FormData>(uploadAvatarAction, {})

  return (
    <form action={action} className="flex flex-wrap items-end gap-3 text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-[var(--text-muted)]">{labels.hint}</span>
        <input
          type="file"
          name="avatar"
          accept="image/png,image/jpeg,image/webp"
          required
          className="text-sm file:mr-3 file:rounded file:border file:border-[var(--border)] file:bg-[var(--bg-raised)] file:px-2 file:py-1 file:text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-[var(--accent)] px-3 py-1.5 font-medium text-[var(--accent-fg)] disabled:opacity-60"
      >
        {pending ? labels.pending : labels.submit}
      </button>
      {state.error ? (
        <span role="alert" className="text-[var(--danger)]">
          {state.error}
        </span>
      ) : null}
      {state.ok ? <span className="text-[var(--text-muted)]">{state.ok}</span> : null}
    </form>
  )
}
