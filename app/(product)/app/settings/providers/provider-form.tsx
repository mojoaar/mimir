'use client'

import { useActionState, useState } from 'react'
import { PRESETS, type PresetId } from '@/lib/providers/presets'
import { createProviderAction, type ProviderFormState } from './actions'

const initial: ProviderFormState = {}

const PRESET_IDS = Object.keys(PRESETS) as PresetId[]

export type ProviderFormLabels = {
  provider: string
  kind: string
  kindLlm: string
  kindEmbedding: string
  label: string
  labelPlaceholder: string
  model: string
  baseUrl: string
  baseUrlHint: string
  apiKey: string
  apiKeyHint: string
  makeDefault: string
  save: string
  saving: string
  saved: string
}

const field =
  'rounded border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-2 text-[var(--fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'

export function ProviderForm({ labels }: { labels: ProviderFormLabels }) {
  const [state, action, pending] = useActionState(createProviderAction, initial)
  const [presetId, setPresetId] = useState<PresetId>('deepseek')
  const [model, setModel] = useState(PRESETS.deepseek.defaultModel)
  const [baseUrl, setBaseUrl] = useState(PRESETS.deepseek.baseUrl)

  function choose(id: PresetId) {
    setPresetId(id)
    setModel(PRESETS[id].defaultModel)
    setBaseUrl(PRESETS[id].baseUrl)
  }

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span>{labels.provider}</span>
          <select
            name="preset"
            value={presetId}
            onChange={(e) => choose(e.target.value as PresetId)}
            className={field}
          >
            {PRESET_IDS.map((id) => (
              <option key={id} value={id}>
                {PRESETS[id].label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>{labels.kind}</span>
          <select name="kind" defaultValue="llm" className={field}>
            <option value="llm">{labels.kindLlm}</option>
            <option value="embedding">{labels.kindEmbedding}</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>{labels.label}</span>
          <input name="label" required placeholder={labels.labelPlaceholder} className={field} />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>{labels.model}</span>
          <input
            name="model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span>{labels.baseUrl}</span>
          <input
            name="baseUrl"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className={field}
          />
          <span className="text-xs text-[var(--text-muted)]">{labels.baseUrlHint}</span>
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span>{labels.apiKey}</span>
          <input name="apiKey" type="password" autoComplete="off" className={field} />
          <span className="text-xs text-[var(--text-muted)]">{labels.apiKeyHint}</span>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isDefault" />
        <span>{labels.makeDefault}</span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-50"
      >
        {pending ? labels.saving : labels.save}
      </button>

      {state.error && <p className="text-sm text-[var(--danger)]">{state.error}</p>}
      {state.ok && <p className="text-sm text-[var(--text-muted)]">{labels.saved}</p>}
    </form>
  )
}
