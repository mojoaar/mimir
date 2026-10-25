import Link from 'next/link'

import { requireUser } from '@/lib/auth/context'
import { listProjects } from '@/lib/projects/service'
import { restoreProjectAction } from './projects/actions'
import { translator } from '@/lib/i18n/request'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>
}) {
  const user = await requireUser()
  const t = await translator()
  const { notice, error } = await searchParams
  const all = await listProjects(user.id, true)
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

      {projects.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          {t('app.dashboard.noProjects')}
        </p>
      ) : (
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
      )}

      {archived.length > 0 ? (
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
