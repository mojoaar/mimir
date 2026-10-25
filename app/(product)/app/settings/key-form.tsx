'use client'

import { useActionState } from 'react'
import { createKeyAction, revokeKeyAction, type CreateKeyState } from './actions'

type Key = {
  id: string
  name: string
  prefix: string
  lastUsedAt: Date | null
  revoked: boolean
}

const initial: CreateKeyState = {}

export function KeyForm() {
  const [state, action, pending] = useActionState(createKeyAction, initial)

  return (
    <div className="space-y-4">
      <form action={action} className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1 text-sm">
          <span>Name</span>
          <input
            name="name"
            required
            placeholder="laptop"
            className="rounded border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-2 text-[var(--fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create key'}
        </button>
      </form>

      {state.error && <p className="text-sm text-[var(--danger)]">{state.error}</p>}

      {state.token && (
        <div className="rounded border border-[var(--accent)] p-3 text-sm">
          <p className="mb-2 font-medium">Copy this now — it is not shown again.</p>
          <code className="block break-all rounded bg-[var(--bg-sunken)] p-2">{state.token}</code>
        </div>
      )}
    </div>
  )
}

export function KeyList({ keys }: { keys: Key[] }) {
  if (keys.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">No keys yet. Your agents need one to reach /mcp.</p>
  }

  return (
    <ul className="divide-y divide-[var(--border)]">
      {keys.map((k) => (
        <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
          <div>
            <span className="font-medium">{k.name}</span>{' '}
            <code className="text-[var(--text-muted)]">{k.prefix}…</code>
            {k.revoked && <span className="ml-2 text-[var(--danger)]">revoked</span>}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[var(--text-muted)]">
              {k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : 'never used'}
            </span>
            {!k.revoked && (
              <form action={revokeKeyAction}>
                <input type="hidden" name="id" value={k.id} />
                <button type="submit" className="text-[var(--danger)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
                  revoke
                </button>
              </form>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
