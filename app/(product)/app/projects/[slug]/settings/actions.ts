'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { audit } from '@/lib/audit'
import { requireUser } from '@/lib/auth/context'
import { enqueueExtraction } from '@/lib/jobs/enqueue'
import { grantProject, requireProjectRole, revokeGrant, type PrincipalType } from '@/lib/projects/access'
import { updateProjectSettings } from '@/lib/projects/service'
import { findActiveUserIdByEmail } from '@/lib/users/lookup'
import { translator } from '@/lib/i18n/request'
import { actionMessage } from '@/lib/i18n/errors'

export type ProjectFormState = { ok?: string; error?: string }

export async function saveProjectSettingsAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const user = await requireUser()
  const t = await translator()
  const projectId = String(formData.get('projectId') ?? '')
  if (!projectId) return { error: t('app.error.generic') }

  const learningEnabled = formData.get('learningEnabled') === 'on'
  const rawProvider = String(formData.get('llmProviderId') ?? '')
  const isOwner = formData.get('isOwner') === 'on'

  const patch: { learningEnabled: boolean; llmProviderId?: string | null } = { learningEnabled }
  if (isOwner) patch.llmProviderId = rawProvider === '' ? null : rawProvider

  try {
    await updateProjectSettings(user.id, projectId, patch)
  } catch (error) {
    return { error: actionMessage(error, t) }
  }

  await audit({
    actorType: 'user',
    actorId: user.id,
    action: 'project.update',
    targetType: 'project',
    targetId: projectId,
    // Only the keys that changed, never the whole row.
    detail: isOwner
      ? { learningEnabled, llmProviderId: patch.llmProviderId ?? null }
      : { learningEnabled },
  })
  revalidatePath('/app')
  revalidatePath(`/app/projects/${String(formData.get('slug') ?? '')}/settings`)

  return { ok: 'Saved.' }
}

/** Shares the project with a person (by email) or a team the caller belongs to. */
export async function grantProjectAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const user = await requireUser()
  const t = await translator()
  const projectId = String(formData.get('projectId') ?? '')
  const slug = String(formData.get('slug') ?? '')
  if (!projectId) return { error: t('app.error.generic') }

  const principalType: PrincipalType =
    formData.get('principalType') === 'team' ? 'team' : 'user'
  const role = formData.get('role') === 'write' ? 'write' : 'read'

  let principalId = String(formData.get('teamId') ?? '')
  if (principalType === 'user') {
    const email = String(formData.get('email') ?? '').trim()
    if (!email) return { error: 'Enter the email address of a person.' }
    const found = await findActiveUserIdByEmail(email)
    if (!found) return { error: t('app.projectSettings.noSuchPerson', { email }) }
    principalId = found
  } else if (!principalId) {
    return { error: t('app.projectSettings.chooseTeam') }
  }

  try {
    await grantProject(user.id, projectId, principalType, principalId, role)
  } catch (error) {
    return { error: actionMessage(error, t) }
  }

  await audit({
    actorType: 'user',
    actorId: user.id,
    action: 'project.grant',
    targetType: 'project',
    targetId: projectId,
    detail: { principalType, principalId, role },
  })
  revalidatePath(`/app/projects/${slug}/settings`)

  return { ok: t(principalType === 'team' ? 'app.projectSettings.sharedTeam' : 'app.projectSettings.shared') }
}

/** Takes one grant away. Access ends on the grantee's next request. */
export async function revokeProjectGrantAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const t = await translator()
  const projectId = String(formData.get('projectId') ?? '')
  const slug = String(formData.get('slug') ?? '')
  const principalId = String(formData.get('principalId') ?? '')
  const principalType: PrincipalType =
    formData.get('principalType') === 'team' ? 'team' : 'user'

  if (!projectId || !principalId) {
    redirect(`/app/projects/${slug}/settings?error=${encodeURIComponent(t('app.error.generic'))}`)
  }

  try {
    await revokeGrant(user.id, projectId, principalType, principalId)
  } catch (error) {
    redirect(
      `/app/projects/${slug}/settings?error=${encodeURIComponent(actionMessage(error, t))}`,
    )
  }

  await audit({
    actorType: 'user',
    actorId: user.id,
    action: 'project.revoke',
    targetType: 'project',
    targetId: projectId,
    detail: { principalType, principalId },
  })
  revalidatePath(`/app/projects/${slug}/settings`)
}

/**
 * Learning is queued by a write, so memories written before it was turned on
 * stay unsummarised forever. These two give the owner a way to drain that
 * backlog without pretending to edit every memory by hand.
 */
export async function summariseProjectAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const t = await translator()
  const projectId = String(formData.get('projectId') ?? '')
  const slug = String(formData.get('slug') ?? '')
  const back = `/app/projects/${slug}/settings`

  try {
    await requireProjectRole(user.id, projectId, 'owner')
  } catch (error) {
    redirect(`${back}?error=${encodeURIComponent(actionMessage(error, t))}`)
  }

  await enqueueExtraction(projectId)
  await audit({
    actorType: 'user',
    actorId: user.id,
    action: 'project.summarise',
    targetType: 'project',
    targetId: projectId,
  })
  revalidatePath(back)

  redirect(`${back}?notice=${encodeURIComponent(t('app.projectSettings.queued'))}`)
}

/** Backfill is gap-only, so a second press costs nothing for memories that already have a vector. */
export async function embedProjectAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const t = await translator()
  const projectId = String(formData.get('projectId') ?? '')
  const slug = String(formData.get('slug') ?? '')
  const back = `/app/projects/${slug}/settings`

  try {
    await requireProjectRole(user.id, projectId, 'owner')
  } catch (error) {
    redirect(`${back}?error=${encodeURIComponent(actionMessage(error, t))}`)
  }

  const { sendJob } = await import('@/lib/jobs/boss')
  await sendJob('backfill', { projectId })
  await audit({
    actorType: 'user',
    actorId: user.id,
    action: 'project.embed',
    targetType: 'project',
    targetId: projectId,
  })
  revalidatePath(back)

  redirect(`${back}?notice=${encodeURIComponent(t('app.projectSettings.queued'))}`)
}
