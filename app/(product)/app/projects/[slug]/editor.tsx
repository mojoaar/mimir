'use client'

import { useActionState } from 'react'

import { saveMemoryAction, type ActionState } from './actions'

const EMPTY: ActionState = {}

export function MemoryEditor({
  slug,
  projectId,
  path,
  body,
}: {
  slug: string
  projectId: string
  path: string
  body: string
}) {
  const [state, action, pending] = useActionState(saveMemoryAction, EMPTY)

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="path" value={path} />
      <textarea
        name="body"
        defaultValue={body}
        rows={18}
        spellCheck={false}
        className="w-full rounded border border-[var(--border)] bg-[var(--bg-raised)] p-3 font-mono text-sm"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-[var(--accent)] px-3 py-2 text-sm text-[var(--accent-fg)] disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <span className="text-xs text-[var(--text-muted)]">
          Saving clears the summary until the model rewrites it.
        </span>
        {state.ok ? <span className="text-sm text-[var(--text-muted)]">{state.ok}</span> : null}
        {state.error ? <span className="text-sm text-[var(--danger)]">{state.error}</span> : null}
      </div>
    </form>
  )
}
