import Link from 'next/link'

import { requireUser } from '@/lib/auth/context'
import { listGrants } from '@/lib/projects/access'
import { listFolders } from '@/lib/projects/folders'
import { listAccessRequests } from '@/lib/projects/requests'
import { listProviders } from '@/lib/providers/service'
import { getProject, getProjectHealth } from '@/lib/projects/service'
import { getEmbeddingConfig } from '@/lib/settings/embedding'
import { listTeams } from '@/lib/teams/service'

import { archiveProjectAction } from '../../actions'
import {
  claimFolderAction,
  embedProjectAction,
  releaseFolderAction,
  resolveAccessRequestAction,
  revokeProjectGrantAction,
  summariseProjectAction,
} from './actions'
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
  searchParams: Promise<{ error?: string; notice?: string }>
}) {
  const user = await requireUser()
  const t = await translator()
  const { slug } = await params
  const { error, notice } = await searchParams
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

  // A role of null is RLS letting the row through with no grant behind it: fail
  // closed rather than ask for counts the caller may not read.
  const [health, embeddingConfigured] = await Promise.all([
    project.role ? getProjectHealth(user.id, project.id) : null,
    getEmbeddingConfig().then((config) => config !== null),
  ])

  // A claim is private to the account that made it (RLS), so only the owner can
  // ever see or use this section; showing a grantee an empty box would lie.
  const folders = project.role === 'owner' ? await listFolders(user.id, project.id) : []
  const requests = project.role === 'owner' ? await listAccessRequests(user.id, project.id) : []

  // Sharing is the owner's to change; a grantee only ever sees what it was given.
  const [grants, teams] =
    project.role === 'owner'
      ? await Promise.all([listGrants(user.id, project.id), listTeams(user.id)])
      : [[], []]

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex gap-4 text-sm">
        <Link href="/app" className="text-[var(--text-muted)] underline">
          {t('app.projectSettings.back')}
        </Link>
        <Link href={`/app/projects/${slug}`} className="text-[var(--text-muted)] underline">
          {t('app.projectSettings.memory')}
        </Link>
      </div>

      <header>
        <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
        <p className="text-sm text-[var(--text-muted)]">
          {project.slug} ·{' '}
          {t('app.projectSettings.youAre', { role: project.role ?? '' })}
        </p>
      </header>

      {error ? (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      {notice ? <p className="text-sm text-[var(--accent)]">{notice}</p> : null}

      {health ? (
        <section className="flex flex-col gap-3 rounded-lg border border-[var(--border)] p-4">
          <p className="text-sm">
            {t('app.projectSettings.health', {
              memories: health.memories,
              summarised: health.summarised,
              embedded: health.embedded,
            })}
          </p>
          {project.role === 'owner' ? (
            <div className="flex flex-wrap items-center gap-2">
              {project.learningEnabled ? (
                <form action={summariseProjectAction}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="slug" value={project.slug} />
                  <button
                    type="submit"
                    className="rounded-md border border-[var(--border)] px-3 py-1 text-sm hover:bg-[var(--bg-raised)]"
                  >
                    {t('app.projectSettings.summarise')}
                  </button>
                </form>
              ) : null}
              {embeddingConfigured ? (
                <form action={embedProjectAction}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="slug" value={project.slug} />
                  <button
                    type="submit"
                    className="rounded-md border border-[var(--border)] px-3 py-1 text-sm hover:bg-[var(--bg-raised)]"
                  >
                    {t('app.projectSettings.embed')}
                  </button>
                </form>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  {t('app.projectSettings.embedOff')}
                </p>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      <ProjectForm
        labels={{
          learnTitle: t('app.projectSettings.learnTitle'),
          learnOn: t('app.projectSettings.learnOn'),
          learnOff: t('app.projectSettings.learnOff'),
          llm: t('app.projectSettings.llm'),
          ownerDefault: t('app.projectSettings.ownerDefault'),
          llmHint: t('app.projectSettings.llmHint'),
          save: t('app.projectSettings.save'),
          saving: t('app.projectSettings.saving'),
        }}
        projectId={project.id}
        slug={project.slug}
        isOwner={project.role === 'owner'}
        learningEnabled={project.learningEnabled}
        llmProviderId={project.llmProviderId}
        providers={providers}
      />

      {project.role === 'owner' ? (
        <section className="flex flex-col gap-3 rounded-lg border border-[var(--border)] p-4">
          <h2 className="text-sm font-semibold">{t('app.projectSettings.folders')}</h2>
          <p className="text-sm text-[var(--text-muted)]">
            {t('app.projectSettings.foldersBody')}
          </p>
          {folders.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {folders.map((folder) => (
                <li
                  key={folder.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-2"
                >
                  <span className="font-mono text-xs">{folder.path}</span>
                  <form action={releaseFolderAction} className="ml-auto">
                    <input type="hidden" name="folderId" value={folder.id} />
                    <input type="hidden" name="slug" value={project.slug} />
                    <button
                      type="submit"
                      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--bg)]"
                    >
                      {t('app.projectSettings.folderRemove')}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
          <form action={claimFolderAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="slug" value={project.slug} />
            <input
              name="folder"
              placeholder="/Users/you/AI"
              className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 font-mono text-xs"
            />
            <button
              type="submit"
              className="rounded-md border border-[var(--border)] px-3 py-1 text-sm hover:bg-[var(--bg-raised)]"
            >
              {t('app.projectSettings.folderAdd')}
            </button>
          </form>
          <p className="text-xs text-[var(--text-muted)]">{t('app.projectSettings.folderHint')}</p>
        </section>
      ) : null}

      {project.role === 'owner' ? (
        <section className="flex flex-col gap-3 rounded-lg border border-[var(--border)] p-4">
          <h2 className="text-sm font-semibold">{t('app.projectSettings.requests')}</h2>
          <p className="text-sm text-[var(--text-muted)]">
            {t('app.projectSettings.requestsBody')}
          </p>
          {requests.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              {t('app.projectSettings.requestsEmpty')}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {requests.map((request) => (
                <li
                  key={request.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--bg-raised)] px-3 py-2 text-sm"
                >
                  <span>{request.email}</span>
                  {request.note ? (
                    <span className="text-[var(--text-muted)]">{request.note}</span>
                  ) : null}
                  <span className="ml-auto flex items-center gap-2">
                    <form action={resolveAccessRequestAction}>
                      <input type="hidden" name="requestId" value={request.id} />
                      <input type="hidden" name="slug" value={project.slug} />
                      <input type="hidden" name="decision" value="grant" />
                      <button
                        type="submit"
                        className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--bg)]"
                      >
                        {t('app.projectSettings.grant')}
                      </button>
                    </form>
                    <form action={resolveAccessRequestAction}>
                      <input type="hidden" name="requestId" value={request.id} />
                      <input type="hidden" name="slug" value={project.slug} />
                      <input type="hidden" name="decision" value="decline" />
                      <button
                        type="submit"
                        className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--bg)]"
                      >
                        {t('app.projectSettings.decline')}
                      </button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {project.role === 'owner' ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">{t('app.projectSettings.sharing')}</h2>
          {grants.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">{t('app.projectSettings.noShares')}</p>
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
                      {t('app.projectSettings.revoke')}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <GrantForm
            labels={{
              title: t('app.grant.title'),
              intro: t('app.grant.intro'),
              with: t('app.grant.with'),
              person: t('app.grant.person'),
              team: t('app.grant.team'),
              can: t('app.grant.can'),
              read: t('app.grant.read'),
              readWrite: t('app.grant.readWrite'),
              email: t('app.grant.email'),
              emailPlaceholder: t('app.grant.emailPlaceholder'),
              teamLabel: t('app.grant.teamLabel'),
              noTeam: t('app.grant.noTeam'),
              hint: t('app.grant.hint'),
              share: t('app.grant.share'),
              sharing: t('app.grant.sharing'),
            }}
            projectId={project.id}
            slug={project.slug}
            teams={teams.map((team) => ({ id: team.id, name: team.name }))}
          />
        </section>
      ) : null}

      {project.role === 'owner' ? (
        <section className="flex flex-col gap-3 rounded-lg border border-[var(--danger)] p-4">
          <h2 className="text-sm font-semibold text-[var(--danger)]">{t('app.projectSettings.danger')}</h2>
          <p className="text-sm text-[var(--text-muted)]">
            {t('app.projectSettings.dangerBody')}
          </p>
          <form action={archiveProjectAction}>
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="slug" value={project.slug} />
            <button
              type="submit"
              className="rounded-md border border-[var(--danger)] px-3 py-1 text-sm text-[var(--danger)] hover:bg-[var(--bg-raised)]"
            >
              {t('app.projectSettings.archive')}
            </button>
          </form>
        </section>
      ) : null}
    </main>
  )
}
