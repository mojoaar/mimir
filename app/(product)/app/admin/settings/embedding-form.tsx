'use client'

import { useActionState } from 'react'
import { saveEmbeddingAction, type EmbeddingFormState } from './actions'

type Option = { id: string; label: string; model: string }

const initial: EmbeddingFormState = {}

export function EmbeddingForm({ providers }: { providers: Option[] }) {
  const [state, action, pending] = useActionState(saveEmbeddingAction, initial)

  if (providers.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Add an embedding provider under Settings first. Ollama with nomic-embed-text is the
        homelab default.
      </p>
    )
  }

  return (
    <form action={action} className="space-y-3 rounded border border-[var(--border)] bg-[var(--bg-raised)] p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-[var(--text-muted)]">Provider</span>
          <select
            name="providerId"
            required
            className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-[var(--text-muted)]">Model</span>
          <input
            name="model"
            required
            defaultValue={providers[0]?.model ?? ''}
            className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1"
          />
        </label>
      </div>

      <p className="text-xs text-[var(--text-muted)]">
        Saving probes the provider and records the dimension it actually returns. The column holds
        768, so a model that answers with another size is refused instead of silently degrading
        search.
      </p>

      {state.error && <p className="text-sm text-[var(--danger)]">{state.error}</p>}
      {state.ok && <p className="text-sm">{state.ok}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--accent-fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-60"
      >
        {pending ? 'Testing…' : 'Test and save'}
      </button>
    </form>
  )
}
