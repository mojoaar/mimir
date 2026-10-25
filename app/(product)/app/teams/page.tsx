import Link from 'next/link'

import { requireUser } from '@/lib/auth/context'
import { listTeams } from '@/lib/teams/service'

import { TeamForm } from './team-form'

export const instant = false

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>
}) {
  const user = await requireUser()
  const { notice } = await searchParams
  const teams = await listTeams(user.id)

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Teams</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Share a project with several people at once. A team grants access; it never owns a
          project.
        </p>
      </header>

      {notice === 'deleted' ? (
        <p className="text-sm text-[var(--text-muted)]">Team deleted, and everything it shared.</p>
      ) : null}

      {teams.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No teams yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {teams.map((team) => (
            <li key={team.id}>
              <Link
                href={`/app/teams/${team.slug}`}
                className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] px-4 py-3 hover:bg-[var(--bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              >
                <span className="font-medium">{team.name}</span>
                <span className="text-sm text-[var(--text-muted)]">
                  {team.role} · {team.memberCount}{' '}
                  {team.memberCount === 1 ? 'member' : 'members'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <TeamForm />
    </main>
  )
}
