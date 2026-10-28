import Link from 'next/link'

import { requireUser } from '@/lib/auth/context'
import { translator, type Translate } from '@/lib/i18n/request'
import { searchMemories, type SearchHit } from '@/lib/memory/search'
import { listProjects } from '@/lib/projects/service'
import { restoreProjectAction } from './projects/actions'

type Group = { slug: string; name: string; hits: SearchHit[] }

function groupByProject(hits: SearchHit[]): Group[] {
  const groups = new Map<string, Group>()
  for (const hit of hits) {
    const group = groups.get(hit.projectSlug) ?? { slug: hit.projectSlug, name: hit.projectName, hits: [] }
    group.hits.push(hit)
    groups.set(hit.projectSlug, group)
  }
  return [...groups.values()]
}

/**
 * Across projects the keyword arm can match the body, where neither the title
 * nor the summary holds the words. Show the quoted line then, and stay quiet
 * when the summary already answers it.
 */
function showExcerpt(hit: SearchHit, query: string): boolean {
  if (!hit.excerpt) return false
  if (!hit.summary) return true
  const summary = hit.summary.toLowerCase()
  return !query
    .toLowerCase()
    .split(/\s+/)
    .some((word) => word.length > 2 && summary.includes(word))
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string; query?: string }>
}) {
  const user = await requireUser()
  const t = await translator()
  const { notice, error, query: typed } = await searchParams
  const query = (typed ?? '').trim()

  const [all, hits] = await Promise.all([
    listProjects(user.id, true),
    query ? searchMemories({ userId: user.id, query, limit: 50 }) : Promise.resolve([]),
  ])
  const projects = all.filter((project) => !project.archived)
  const archived = all.filter((project) => project.archived)

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6 sm:py-12">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Mimir</h1>
          <p className="text-sm text-[var(--text-muted)]">{user.email}</p>
        </div>
      </header>

      <form action="/app" className="flex flex-wrap gap-2">
        <input
          name="query"
          defaultValue={query}
          placeholder={t('app.dashboard.searchPlaceholder')}
          aria-label={t('app.dashboard.searchPlaceholder')}
          className="min-w-0 flex-1 rounded border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--fg)' }}
        />
        <button
          type="submit"
          className="rounded px-4 py-2 text-sm font-medium"
          style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
        >
          {t('app.dashboard.search')}
        </button>
      </form>

      {notice ? (
        <p role="status" className="text-sm text-[var(--accent)]">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      {query ? <Results groups={groupByProject(hits)} query={query} t={t} /> : null}

      {!query && projects.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          {t('app.dashboard.noProjects')}
        </p>
      ) : null}

      {!query && projects.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {projects.map((project) => (
            <li
              key={project.slug}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/app/projects/${project.slug}`}
                  className="font-medium hover:underline"
                >
                  {project.name}
                </Link>
                <span className="text-xs text-[var(--text-muted)]">
                  {project.role ?? 'read'} ·{' '}
                  {project.memoryCount === 1
                    ? t('app.dashboard.oneMemory', { count: project.memoryCount })
                    : t('app.dashboard.manyMemories', { count: project.memoryCount })}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{project.slug}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {!query && archived.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-[var(--text-muted)]">
            {t('app.dashboard.archived')}
          </h2>
          <ul className="flex flex-col gap-3">
            {archived.map((project) => (
              <li
                key={project.slug}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] p-4"
              >
                <div>
                  <p className="font-medium">{project.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {project.slug} · {t('app.dashboard.hidden')}
                  </p>
                </div>
                {project.role === 'owner' ? (
                  <form action={restoreProjectAction}>
                    <input type="hidden" name="projectId" value={project.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-[var(--border)] px-3 py-1 text-sm hover:bg-[var(--bg-sunken)]"
                    >
                      {t('app.dashboard.restore')}
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  )
}

function Results({ groups, query, t }: { groups: Group[]; query: string; t: Translate }) {
  if (groups.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">{t('app.browse.noMatches')}</p>
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.slug} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">
            <Link href={`/app/projects/${group.slug}`} className="hover:underline">
              {group.name}
            </Link>
          </h2>
          <ul className="flex flex-col gap-2">
            {group.hits.map((hit) => (
              <li key={`${group.slug}/${hit.path}`}>
                <Link
                  href={`/app/projects/${group.slug}?path=${encodeURIComponent(hit.path)}`}
                  className="block rounded border border-[var(--border)] p-3 hover:bg-[var(--bg-raised)]"
                >
                  <span className="block text-sm font-medium">{hit.title}</span>
                  <span className="block text-xs text-[var(--text-muted)]">{hit.path}</span>
                  {hit.summary ? (
                    <span className="mt-1 block text-sm text-[var(--text-muted)]">{hit.summary}</span>
                  ) : null}
                  {showExcerpt(hit, query) ? (
                    <span className="mt-1 block text-xs text-[var(--text-muted)]">{hit.excerpt}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
