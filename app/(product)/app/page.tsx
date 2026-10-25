import Link from 'next/link'

import { requireUser } from '@/lib/auth/context'
import { listProjects } from '@/lib/projects/service'
import { signOutAction } from './actions'

export default async function DashboardPage() {
  const user = await requireUser()
  const projects = await listProjects(user.id)

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-12">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Mimir</h1>
          <p className="text-sm text-[var(--text-muted)]">{user.email}</p>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="text-sm text-[var(--text-muted)] underline hover:text-[var(--fg)]"
          >
            Sign out
          </button>
        </form>
      </header>

      {projects.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          No projects yet. Agents create one the first time they write a memory.
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
                  {project.role ?? 'read'} · {project.memoryCount}{' '}
                  {project.memoryCount === 1 ? 'memory' : 'memories'}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{project.slug}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
