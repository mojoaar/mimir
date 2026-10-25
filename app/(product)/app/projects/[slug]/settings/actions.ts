'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { audit } from '@/lib/audit'
import { requireUser } from '@/lib/auth/context'
import { grantProject, revokeGrant, type PrincipalType } from '@/lib/projects/access'
import { updateProjectSettings } from '@/lib/projects/service'
import { findActiveUserIdByEmail } from '@/lib/users/lookup'

export type ProjectFormState = { ok?: string; error?: string }

const KNOWN: Record<string, string> = {
  forbidden: 'Only the project owner can change that.',
  invalid_params: 'That setting is not valid.',
  not_found: 'That project no longer exists.',
}

export async function saveProjectSettingsAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const user = await requireUser()
  const projectId = String(formData.get('projectId') ?? '')
  if (!projectId) return { error: 'Missing project.' }

  const learningEnabled = formData.get('learningEnabled') === 'on'
  const rawProvider = String(formData.get('llmProviderId') ?? '')
  const isOwner = formData.get('isOwner') === 'on'

  const patch: { learningEnabled: boolean; llmProviderId?: string | null } = { learningEnabled }
  if (isOwner) patch.llmProviderId = rawProvider === '' ? null : rawProvider

  try {
    await updateProjectSettings(user.id, projectId, patch)
  } catch (error) {
    const code = (error as { code?: string }).code ?? ''
    return { error: KNOWN[code] ?? 'Could not save the project settings.' }
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
  const projectId = String(formData.get('projectId') ?? '')
  const slug = String(formData.get('slug') ?? '')
  if (!projectId) return { error: 'Missing project.' }

  const principalType: PrincipalType =
    formData.get('principalType') === 'team' ? 'team' : 'user'
  const role = formData.get('role') === 'write' ? 'write' : 'read'

  let principalId = String(formData.get('teamId') ?? '')
  if (principalType === 'user') {
    const email = String(formData.get('email') ?? '').trim()
    if (!email) return { error: 'Enter the email address of a person.' }
    const found = await findActiveUserIdByEmail(email)
    if (!found) return { error: `nobody with an active account uses ${email}` }
    principalId = found
  } else if (!principalId) {
    return { error: 'Choose a team.' }
  }

  try {
    await grantProject(user.id, projectId, principalType, principalId, role)
  } catch (error) {
    const code = (error as { code?: string }).code ?? ''
    return { error: KNOWN[code] ?? 'Could not share the project.' }
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

  return { ok: principalType === 'team' ? 'Shared with the team.' : 'Shared.' }
}

/** Takes one grant away. Access ends on the grantee's next request. */
export async function revokeProjectGrantAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const projectId = String(formData.get('projectId') ?? '')
  const slug = String(formData.get('slug') ?? '')
  const principalId = String(formData.get('principalId') ?? '')
  const principalType: PrincipalType =
    formData.get('principalType') === 'team' ? 'team' : 'user'

  if (!projectId || !principalId) redirect(`/app/projects/${slug}/settings?error=Missing grant.`)

  try {
    await revokeGrant(user.id, projectId, principalType, principalId)
  } catch (error) {
    const code = (error as { code?: string }).code ?? ''
    const message = KNOWN[code] ?? 'Could not revoke that.'
    redirect(`/app/projects/${slug}/settings?error=${encodeURIComponent(message)}`)
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
