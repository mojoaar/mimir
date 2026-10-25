'use client'

import { useActionState } from 'react'

import { saveProjectSettingsAction, type ProjectFormState } from './actions'

type Provider = { id: string; label: string; model: string }

export function ProjectForm({
  projectId,
  slug,
  isOwner,
  learningEnabled,
  llmProviderId,
  providers,
}: {
  projectId: string
  slug: string
  isOwner: boolean
  learningEnabled: boolean
  llmProviderId: string | null
  providers: Provider[]
}) {
  const [state, action, pending] = useActionState<ProjectFormState, FormData>(
    saveProjectSettingsAction,
    {},
  )

  return (
    <form
      action={action}
      className="flex flex-col gap-5 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] p-4"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="slug" value={slug} />
      {isOwner ? <input type="hidden" name="isOwner" value="on" /> : null}

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="learningEnabled"
          defaultChecked={learningEnabled}
          className="mt-0.5"
        />
        <span className="text-sm">
          <span className="font-medium">Learn from this project</span>
          <span className="mt-1 block text-[var(--text-muted)]">
            Let Mimir write a one-line title and a short summary for each memory using your
            language model.
          </span>
        </span>
      </label>

      {isOwner ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Language model</span>
          <select
            name="llmProviderId"
            defaultValue={llmProviderId ?? ''}
            className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5"
          >
            <option value="">Owner default</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label} · {provider.model}
              </option>
            ))}
          </select>
          <span className="text-[var(--text-muted)]">
            Extraction spends this provider&apos;s key, so only the owner can change it.
          </span>
        </label>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent-fg)] disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        {state.error ? (
          <span className="text-sm text-[var(--danger)]">{state.error}</span>
        ) : null}
        {state.ok ? <span className="text-sm text-[var(--text-muted)]">{state.ok}</span> : null}
      </div>
    </form>
  )
}
