import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requireUser } from '@/lib/auth/context'
import { listProviders } from '@/lib/providers/service'
import { getProject } from '@/lib/projects/service'

import { ProjectForm } from './project-form'

export const instant = false

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const user = await requireUser()
  const { slug } = await params
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

      <ProjectForm
        projectId={project.id}
        slug={project.slug}
        isOwner={project.role === 'owner'}
        learningEnabled={project.learningEnabled}
        llmProviderId={project.llmProviderId}
        providers={providers}
      />
    </main>
  )
}
