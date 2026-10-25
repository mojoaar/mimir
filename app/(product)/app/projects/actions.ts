'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireUser } from '@/lib/auth/context'
import { archiveProject, restoreProject } from '@/lib/projects/service'

const KNOWN: Record<string, string> = {
  forbidden: 'Only the project owner can change that.',
  not_found: 'That project no longer exists.',
}

/** Archive and restore are plain form submits: they end in a redirect, not in state. */
export async function archiveProjectAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const projectId = String(formData.get('projectId') ?? '')
  if (!projectId) redirect('/app?error=Missing+project.')

  try {
    await archiveProject(user.id, projectId)
  } catch (error) {
    const code = (error as { code?: string }).code ?? ''
    redirect(`/app/projects/${String(formData.get('slug') ?? '')}/settings?error=${encodeURIComponent(KNOWN[code] ?? 'Could not archive the project.')}`)
  }

  revalidatePath('/app')
  redirect('/app?notice=Project+archived.')
}

export async function restoreProjectAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const projectId = String(formData.get('projectId') ?? '')
  if (!projectId) redirect('/app?error=Missing+project.')

  try {
    await restoreProject(user.id, projectId)
  } catch (error) {
    const code = (error as { code?: string }).code ?? ''
    redirect(`/app?error=${encodeURIComponent(KNOWN[code] ?? 'Could not restore the project.')}`)
  }

  revalidatePath('/app')
  redirect('/app?notice=Project+restored.')
}
