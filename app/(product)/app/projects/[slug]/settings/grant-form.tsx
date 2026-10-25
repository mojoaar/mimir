'use client'

import { useActionState } from 'react'

import { grantProjectAction, type ProjectFormState } from './actions'

type Team = { id: string; name: string }

export function GrantForm({
  projectId,
  slug,
  teams,
}: {
  projectId: string
  slug: string
  teams: Team[]
}) {
  const [state, action, pending] = useActionState<ProjectFormState, FormData>(
    grantProjectAction,
    {},
  )

  const field =
    'rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm'

  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] p-4"
    >
      <div>
        <h3 className="text-sm font-semibold">Share this project</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          A person or a team can read or write the memories here. They never own the project, so
          they cannot rename, archive or re-share it.
        </p>
      </div>

      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="slug" value={slug} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Share with</span>
          <select name="principalType" className={field} defaultValue="user">
            <option value="user">A person</option>
            <option value="team">A team</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Can</span>
          <select name="role" className={field} defaultValue="read">
            <option value="read">Read</option>
            <option value="write">Read and write</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Person’s email</span>
          <input
            type="email"
            name="email"
            autoComplete="off"
            placeholder="they must already have an account"
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Team</span>
          <select name="teamId" className={field} defaultValue={teams[0]?.id ?? ''}>
            {teams.length === 0 ? (
              <option value="">You are not in a team yet</option>
            ) : (
              teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))
            )}
          </select>
        </label>
      </div>

      <p className="text-sm text-[var(--text-muted)]">
        Fill the email for a person, or pick a team — the choice above decides which one is used.
      </p>

      {state.error ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <p className="text-sm text-[var(--text-muted)]">{state.ok}</p> : null}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent-fg)] disabled:opacity-60"
        >
          {pending ? 'Sharing…' : 'Share'}
        </button>
      </div>
    </form>
  )
}
