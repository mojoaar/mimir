'use client'

import { useActionState, useState } from 'react'
import { createKeyAction, revokeKeyAction, type CreateKeyState } from './actions'

type Key = {
  id: string
  name: string
  prefix: string
  lastUsedAt: string | null
  revoked: boolean
}

export type KeyFormLabels = {
  name: string
  placeholder: string
  create: string
  creating: string
  copyNow: string
  copy: string
  copied: string
}

export type KeyListLabels = {
  empty: string
  revoked: string
  neverUsed: string
  lastUsed: string
  revoke: string
}

const initial: CreateKeyState = {}

export function KeyForm({ labels }: { labels: KeyFormLabels }) {
  const [state, action, pending] = useActionState(createKeyAction, initial)

  return (
    <div className="space-y-4">
      <form action={action} className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1 text-sm">
          <span>{labels.name}</span>
          <input
            name="name"
            required
            placeholder={labels.placeholder}
            className="rounded border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-2 text-[var(--fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-50"
        >
          {pending ? labels.creating : labels.create}
        </button>
      </form>

      {state.error && <p className="text-sm text-[var(--danger)]">{state.error}</p>}

      {state.token && <KeyToken token={state.token} labels={labels} />}
    </div>
  )
}

/**
 * The one moment the key is readable. The copy control is here rather than in
 * the list below, where only a prefix is ever shown.
 */
export function KeyToken({ token, labels }: { token: string; labels: KeyFormLabels }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // A browser can refuse the clipboard; the key stays selectable below.
    }
  }

  return (
    <div className="rounded border border-[var(--accent)] p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{labels.copyNow}</p>
        <button
          type="button"
          onClick={copy}
          className="rounded border border-[var(--accent)] px-2 py-0.5 text-xs text-[var(--accent)] hover:bg-[var(--bg-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          {copied ? labels.copied : labels.copy}
        </button>
      </div>
      <code className="block break-all rounded bg-[var(--bg-sunken)] p-2">{token}</code>
    </div>
  )
}

export function KeyList({ keys, labels }: { keys: Key[]; labels: KeyListLabels }) {
  if (keys.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">{labels.empty}</p>
  }

  return (
    <ul className="divide-y divide-[var(--border)]">
      {keys.map((k) => (
        <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
          <div>
            <span className="font-medium">{k.name}</span>{' '}
            <code className="text-[var(--text-muted)]">{k.prefix}…</code>
            {k.revoked && <span className="ml-2 text-[var(--danger)]">{labels.revoked}</span>}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[var(--text-muted)]">
              {k.lastUsedAt
                ? labels.lastUsed.replace('{date}', k.lastUsedAt)
                : labels.neverUsed}
            </span>
            {!k.revoked && (
              <form action={revokeKeyAction}>
                <input type="hidden" name="id" value={k.id} />
                <button type="submit" className="text-[var(--danger)] underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
                  {labels.revoke}
                </button>
              </form>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
