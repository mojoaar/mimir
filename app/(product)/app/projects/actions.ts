'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireUser } from '@/lib/auth/context'
import { actionMessage } from '@/lib/i18n/errors'
import { archiveProject, deleteProject, restoreProject } from '@/lib/projects/service'
import { translator } from '@/lib/i18n/request'



/** Archive and restore are plain form submits: they end in a redirect, not in state. */
export async function archiveProjectAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const t = await translator()
  const projectId = String(formData.get('projectId') ?? '')
  if (!projectId) redirect(`/app?error=${encodeURIComponent(t('app.project.missing'))}`)

  try {
    await archiveProject(user.id, projectId)
  } catch (error) {
    const code = (error as { code?: string }).code ?? ''
    const message =
      code === 'forbidden'
        ? t('app.project.onlyOwner')
        : code === 'not_found'
          ? t('app.project.gone')
          : t('app.project.archiveFailed')
    redirect(
      `/app/projects/${String(formData.get('slug') ?? '')}/settings?error=${encodeURIComponent(message)}`,
    )
  }

  revalidatePath('/app')
  redirect(`/app?notice=${encodeURIComponent(t('app.project.archived'))}`)
}

export async function restoreProjectAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const t = await translator()
  const projectId = String(formData.get('projectId') ?? '')
  if (!projectId) redirect(`/app?error=${encodeURIComponent(t('app.project.missing'))}`)

  try {
    await restoreProject(user.id, projectId)
  } catch (error) {
    const code = (error as { code?: string }).code ?? ''
    redirect(`/app?error=${encodeURIComponent(t('app.project.restoreFailed'))}`)
  }

  revalidatePath('/app')
  redirect(`/app?notice=${encodeURIComponent(t('app.project.restored'))}`)
}

/** Irreversible, so the typed slug is checked here for a message, and again in the service. */
export async function deleteProjectAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const t = await translator()
  const projectId = String(formData.get('projectId') ?? '')
  const slug = String(formData.get('slug') ?? '')
  if (!projectId) redirect(`/app?error=${encodeURIComponent(t('app.project.missing'))}`)

  if (String(formData.get('confirmSlug') ?? '').trim().toLowerCase() !== slug.toLowerCase()) {
    redirect(`/app?error=${encodeURIComponent(t('app.project.confirmMismatch'))}`)
  }

  try {
    await deleteProject(user.id, projectId, slug)
  } catch (error) {
    redirect(`/app?error=${encodeURIComponent(actionMessage(error, t))}`)
  }

  revalidatePath('/app')
  redirect(`/app?notice=${encodeURIComponent(t('app.project.deleted', { slug }))}`)
}
