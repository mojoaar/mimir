import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requireUser } from '@/lib/auth/context'
import { listProviders } from '@/lib/providers/service'
import { getProject } from '@/lib/projects/service'

import { archiveProjectAction } from '../../actions'
import { ProjectForm } from './project-form'

export const instant = false

export default async function ProjectSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const user = await requireUser()
  const { slug } = await params
  const { error } = await searchParams
  const project = await getProject(user.id, slug)
  if (!project) notFound()

  // Only the owner may point a project at a provider: that spends the owner's key.
  const providers =
    project.role === 'owner'
      ? (await listProviders(user.id, 'llm')).map((p) => ({
          id: p.id,
          label: p.label,
          model: p.model,
        }))
      : []

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
