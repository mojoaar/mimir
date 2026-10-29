import { diffLines as computeDiff } from 'diff'
import Link from 'next/link'

import type { VersionSummary } from '@/lib/memory/versions'

export type Labels = {
  title: string
  back: string
  empty: string
  replaced: string
  restore: string
  kept: string
}

export type DiffLine = { kind: 'same' | 'add' | 'remove'; text: string }

/**
 * A unified line diff: `remove` lines are what the version had, `add` lines are
 * what the current memory says instead. Long unchanged stretches are kept whole
 * rather than collapsed - a memory is short enough that context helps.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  return computeDiff(before, after).flatMap((part) => {
    const kind: DiffLine['kind'] = part.added ? 'add' : part.removed ? 'remove' : 'same'
    return part.value
      .split('\n')
      .filter((text, index, all) => text !== '' || index < all.length - 1)
      .map((text) => ({ kind, text }))
  })
}

const PREFIX: Record<DiffLine['kind'], string> = { same: '  ', add: '+ ', remove: '- ' }

export function MemoryHistory({
  slug,
  projectId,
  path,
  versions,
  canWrite,
  selected,
  diff,
  restore,
  labels,
}: {
  slug: string
  projectId: string
  path: string
  versions: VersionSummary[]
  canWrite: boolean
  selected: { id: string; updatedAt: Date } | null
  diff: DiffLine[] | null
  /** Passed in so the panel stays renderable without the server-action module. */
  restore: (formData: FormData) => void | Promise<void>
  labels: Labels
}) {
  const base = `/app/projects/${slug}?path=${encodeURIComponent(path)}&history=1`

  return (
    <section className="flex flex-col gap-3 rounded border border-[var(--border)] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{labels.title}</h3>
        <Link href={`/app/projects/${slug}?path=${encodeURIComponent(path)}`} className="text-xs underline">
          {labels.back}
        </Link>
      </div>

      {versions.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          {labels.empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {versions.map((version) => {
            const isSelected = selected?.id === version.id
            return (
              <li key={version.id}>
                <Link
                  href={`${base}&version=${version.id}`}
                  className={`flex flex-wrap items-baseline justify-between gap-2 rounded border px-2 py-1 text-xs ${
                    isSelected
                      ? 'border-[var(--accent)] bg-[var(--bg-raised)]'
                      : 'border-transparent hover:bg-[var(--bg-raised)]'
                  }`}
                >
                  <span className="min-w-0 truncate">{version.title}</span>
                  <span className="text-[var(--text-muted)]">
                    {version.updatedAt.toISOString()} · {version.bytes} B
                    {/* An identifier, not a sentence: no label key, and the
                        session is shortened to what tells two apart. */}
                    {version.client ? ` · ${version.client}` : ''}
                    {version.session ? ` ${version.session.slice(0, 8)}` : ''}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {selected && diff ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[var(--text-muted)]">
            {labels.replaced}
          </p>
          <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-words rounded border border-[var(--border)] bg-[var(--bg-raised)] p-2 text-xs">
            {diff.map((line, index) => (
              <span
                key={index}
                className={
                  line.kind === 'add'
                    ? 'block text-[var(--accent)]'
                    : line.kind === 'remove'
                      ? 'block text-[var(--danger)]'
                      : 'block text-[var(--text-muted)]'
                }
              >
                {PREFIX[line.kind]}
                {line.text}
              </span>
            ))}
          </pre>
          {canWrite ? (
            <form action={restore} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="path" value={path} />
              <input type="hidden" name="versionId" value={selected.id} />
              <button
                type="submit"
                className="rounded border border-[var(--border)] px-3 py-1 text-sm text-[var(--fg)]"
              >
                {labels.restore}
              </button>
              <span className="text-xs text-[var(--text-muted)]">
                {labels.kept}
              </span>
            </form>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
