'use client'

import { useActionState } from 'react'
import type { ProviderKind } from '@/lib/providers/presets'
import { savePricesAction, type ProviderFormState } from './actions'

const initial: ProviderFormState = {}

const field =
  'w-24 rounded border border-[var(--border)] bg-[var(--bg-raised)] px-2 py-1 text-xs text-[var(--fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'

/** Prices are per million tokens, the unit every provider quotes them in. */
export function PriceForm({
  id,
  kind,
  inputPrice,
  outputPrice,
  labels,
}: {
  id: string
  kind: ProviderKind
  inputPrice: number | null
  outputPrice: number | null
  labels: { in: string; out: string; save: string; saved: string; invalid: string }
}) {
  const [state, action, pending] = useActionState(savePricesAction, initial)

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
        <span>{labels.in} / 1M</span>
        <input
          name="inputPrice"
          type="number"
          min="0"
          step="0.0001"
          defaultValue={inputPrice ?? ''}
          className={field}
        />
      </label>
      {kind === 'llm' && (
        <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
          <span>{labels.out} / 1M</span>
          <input
            name="outputPrice"
            type="number"
            min="0"
            step="0.0001"
            defaultValue={outputPrice ?? ''}
            className={field}
          />
        </label>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--bg-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-50"
      >
        {labels.save}
      </button>
      {state.ok && <span className="text-xs text-[var(--text-muted)]">{labels.saved}</span>}
      {state.error && <span className="text-xs text-[var(--danger)]">{state.error}</span>}
    </form>
  )
}
