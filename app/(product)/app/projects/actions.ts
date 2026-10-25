'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireUser } from '@/lib/auth/context'
import { archiveProject, restoreProject } from '@/lib/projects/service'
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
