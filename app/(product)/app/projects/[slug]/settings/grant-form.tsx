'use client'

import { useActionState } from 'react'

import { grantProjectAction, type ProjectFormState } from './actions'

type Team = { id: string; name: string }

export type GrantFormLabels = {
  title: string
  intro: string
  with: string
  person: string
  team: string
  can: string
  read: string
  readWrite: string
  email: string
  emailPlaceholder: string
  teamLabel: string
  noTeam: string
  hint: string
  share: string
  sharing: string
}

export function GrantForm({
  projectId,
  slug,
  teams,
  labels,
}: {
  projectId: string
  slug: string
  teams: Team[]
  labels: GrantFormLabels
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
        <h3 className="text-sm font-semibold">{labels.title}</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {labels.intro}
        </p>
      </div>

      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="slug" value={slug} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{labels.with}</span>
          <select name="principalType" className={field} defaultValue="user">
            <option value="user">{labels.person}</option>
            <option value="team">{labels.team}</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{labels.can}</span>
          <select name="role" className={field} defaultValue="read">
            <option value="read">{labels.read}</option>
            <option value="write">{labels.readWrite}</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{labels.email}</span>
          <input
            type="email"
            name="email"
            autoComplete="off"
            placeholder={labels.emailPlaceholder}
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{labels.teamLabel}</span>
          <select name="teamId" className={field} defaultValue={teams[0]?.id ?? ''}>
            {teams.length === 0 ? (
              <option value="">{labels.noTeam}</option>
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
        {labels.hint}
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
          {pending ? labels.sharing : labels.share}
        </button>
      </div>
    </form>
  )
}
