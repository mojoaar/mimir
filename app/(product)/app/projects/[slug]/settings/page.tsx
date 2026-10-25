import Link from 'next/link'

import { requireUser } from '@/lib/auth/context'
import { listGrants } from '@/lib/projects/access'
import { listProviders } from '@/lib/providers/service'
import { getProject } from '@/lib/projects/service'
import { listTeams } from '@/lib/teams/service'

import { archiveProjectAction } from '../../actions'
import { revokeProjectGrantAction } from './actions'
import { GrantForm } from './grant-form'
import { ProjectForm } from './project-form'
import { Missing } from '../../missing'
import { translator } from '@/lib/i18n/request'

export const instant = false

export default async function ProjectSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const user = await requireUser()
  const t = await translator()
  const { slug } = await params
  const { error } = await searchParams
  const project = await getProject(user.id, slug)
  if (!project) return <Missing kind="project" t={t} />

  // Only the owner may point a project at a provider: that spends the owner's key.
  const providers =
    project.role === 'owner'
      ? (await listProviders(user.id, 'llm')).map((p) => ({
          id: p.id,
          label: p.label,
          model: p.model,
        }))
      : []

  // Sharing is the owner's to change; a grantee only ever sees what it was given.
  const [grants, teams] =
    project.role === 'owner'
      ? await Promise.all([listGrants(user.id, project.id), listTeams(user.id)])
      : [[], []]

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex gap-4 text-sm">
        <Link href="/app" className="text-[var(--text-muted)] underline">
          ← Projects
        </Link>
        <Link href={`/app/projects/${slug}`} className="text-[var(--text-muted)] underline">
          Memory
        </Link>
      </div>

      <header>
        <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
        <p className="text-sm text-[var(--text-muted)]">
          {project.slug} · you are {project.role}
        </p>
      </header>

      {error ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      <ProjectForm
        projectId={project.id}
        slug={project.slug}
        isOwner={project.role === 'owner'}
        learningEnabled={project.learningEnabled}
        llmProviderId={project.llmProviderId}
        providers={providers}
      />

      {project.role === 'owner' ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Sharing</h2>
          {grants.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Nobody else can see this project yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {grants.map((grant) => (
                <li
                  key={`${grant.principalType}:${grant.principalId}`}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-raised)] p-3 text-sm"
                >
                  <span className="font-medium">{grant.label}</span>
                  <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                    {grant.principalType}
                  </span>
                  <span className="text-[var(--text-muted)]">{grant.role}</span>
                  <form action={revokeProjectGrantAction} className="ml-auto">
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="slug" value={project.slug} />
                    <input type="hidden" name="principalType" value={grant.principalType} />
                    <input type="hidden" name="principalId" value={grant.principalId} />
                    <button
                      type="submit"
                      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--bg)]"
                    >
                      Revoke
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <GrantForm
            projectId={project.id}
            slug={project.slug}
            teams={teams.map((team) => ({ id: team.id, name: team.name }))}
          />
        </section>
      ) : null}

      {project.role === 'owner' ? (
        <section className="flex flex-col gap-3 rounded-lg border border-[var(--danger)] p-4">
          <h2 className="text-sm font-semibold text-[var(--danger)]">Danger zone</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Hidden from every list and API call. Memories and grants are kept; you can restore it
            from the projects page.
          </p>
          <form action={archiveProjectAction}>
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="slug" value={project.slug} />
            <button
              type="submit"
              className="rounded-md border border-[var(--danger)] px-3 py-1 text-sm text-[var(--danger)] hover:bg-[var(--bg-raised)]"
            >
              Archive project
            </button>
          </form>
        </section>
      ) : null}
    </main>
  )
}
