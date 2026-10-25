import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requireUser } from '@/lib/auth/context'
import { getTeam } from '@/lib/teams/service'

import { deleteTeamAction, leaveTeamAction, removeMemberAction } from '../actions'
import { MemberForm } from './member-form'
import { RenameForm } from './rename-form'

export const instant = false

export default async function TeamDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; notice?: string }>
}) {
  const user = await requireUser()
  const { id } = await params
  const { error, notice } = await searchParams
  const found = await getTeam(user.id, id)
  if (!found) notFound()

  const { team, members } = found
  const isOwner = team.role === 'owner'
  const owners = members.filter((m) => m.role === 'owner').length
  const canLeave = team.role === 'member' || (isOwner && owners > 1)

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex gap-4 text-sm">
        <Link href="/app/teams" className="text-[var(--text-muted)] underline">
          ← Teams
        </Link>
      </div>

      <header>
        <h1 className="text-xl font-semibold tracking-tight">{team.name}</h1>
        <p className="text-sm text-[var(--text-muted)]">
          {team.memberCount} {team.memberCount === 1 ? 'member' : 'members'} · you are {team.role}
        </p>
      </header>

      {error ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      {notice === 'removed' ? (
        <p className="text-sm text-[var(--text-muted)]">Member removed. Their access ended now.</p>
      ) : null}

      {isOwner ? <RenameForm teamId={team.id} name={team.name} /> : null}

      <ul className="flex flex-col gap-2">
        {members.map((member) => (
          <li
            key={member.userId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] px-4 py-3"
          >
            <span className="text-sm">
              {member.email}
              <span className="ml-2 text-[var(--text-muted)]">{member.role}</span>
            </span>
            {isOwner && member.role !== 'owner' ? (
              <form action={removeMemberAction}>
                <input type="hidden" name="teamId" value={team.id} />
                <input type="hidden" name="userId" value={member.userId} />
                <button
                  type="submit"
                  className="rounded border border-[var(--border)] px-2 py-1 text-sm text-[var(--danger)]"
                >
                  Remove
                </button>
              </form>
            ) : null}
            {member.userId === user.id && canLeave ? (
              <form action={leaveTeamAction}>
                <input type="hidden" name="teamId" value={team.id} />
                <button
                  type="submit"
                  className="rounded border border-[var(--border)] px-2 py-1 text-sm text-[var(--danger)]"
                >
                  Leave team
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>

      {isOwner ? <MemberForm teamId={team.id} /> : null}

      {isOwner ? (
        <section className="flex flex-col gap-2 rounded-lg border border-[var(--danger)] p-4">
          <h2 className="text-sm font-semibold">Delete team</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Every project this team can see stops being shared with it. The projects themselves
            are untouched.
          </p>
          <form action={deleteTeamAction} className="self-start">
            <input type="hidden" name="teamId" value={team.id} />
            <button
              type="submit"
              className="rounded border border-[var(--danger)] px-3 py-1.5 text-sm text-[var(--danger)]"
            >
              Delete team
            </button>
          </form>
        </section>
      ) : null}
    </main>
  )
}
