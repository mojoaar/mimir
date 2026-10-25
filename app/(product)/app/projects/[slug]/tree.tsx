import Link from 'next/link'

import type { TreeEntry } from '@/lib/memory/service'

type Props = {
  slug: string
  entries: TreeEntry[]
  active?: string
  deletedCount: number
  showDeleted: boolean
}

function group(entries: TreeEntry[]): { dir: string; rows: TreeEntry[] }[] {
  const groups = new Map<string, TreeEntry[]>()
  for (const entry of entries) {
    const slash = entry.path.lastIndexOf('/')
    const dir = slash === -1 ? '' : entry.path.slice(0, slash)
    groups.set(dir, [...(groups.get(dir) ?? []), entry])
  }
  return [...groups].map(([dir, rows]) => ({ dir, rows }))
}

export function MemoryTree({ slug, entries, active, deletedCount, showDeleted }: Props) {
  const base = `/app/projects/${slug}`

  return (
    <nav aria-label="Memory" className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href={base}
          className={`rounded border px-2 py-1 ${
            showDeleted
              ? 'border-[var(--border)] text-[var(--text-muted)]'
              : 'border-[var(--accent)] text-[var(--fg)]'
          }`}
        >
          Live
        </Link>
        <Link
          href={`${base}?deleted=1`}
          className={`rounded border px-2 py-1 ${
            showDeleted
              ? 'border-[var(--accent)] text-[var(--fg)]'
              : 'border-[var(--border)] text-[var(--text-muted)]'
          }`}
        >
          Deleted{deletedCount > 0 ? ` (${deletedCount})` : ''}
        </Link>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">Nothing stored yet.</p>
      ) : (
        group(entries).map(({ dir, rows }) => (
          <section key={dir || '/'} className="flex flex-col gap-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {dir || '/'}
            </h2>
            <ul className="flex flex-col">
              {rows.map((entry) => {
                const leaf = dir ? entry.path.slice(dir.length + 1) : entry.path
                const selected = entry.path === active
                return (
                  <li key={entry.path}>
                    <Link
                      href={`${base}?path=${encodeURIComponent(entry.path)}`}
                      className={`flex items-start gap-2 rounded px-2 py-1 text-sm ${
                        selected ? 'bg-[var(--bg-raised)] text-[var(--fg)]' : 'text-[var(--text-muted)]'
                      }`}
                    >
                      <span aria-hidden className="mt-1 text-[10px]">
                        {entry.hasSummary ? '●' : '○'}
                      </span>
                      <span className="min-w-0 break-words">{leaf}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
    </nav>
  )
}
