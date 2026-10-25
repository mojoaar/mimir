'use server'

import { revalidatePath } from 'next/cache'

import { audit } from '@/lib/audit'
import { requireUser } from '@/lib/auth/context'
import { updateProjectSettings } from '@/lib/projects/service'

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
