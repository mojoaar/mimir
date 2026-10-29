'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

/**
 * Re-runs the page's server components without reloading the document. Same
 * URL, so `?sort=` and `?path=` survive, and client state (an open editor with
 * unsaved text) is kept.
 */
export function RefreshButton({ label, busy }: { label: string; busy: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => router.refresh())}
      className="rounded border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-raised)] hover:text-[var(--fg)] disabled:opacity-60"
    >
      {pending ? busy : label}
    </button>
  )
}
