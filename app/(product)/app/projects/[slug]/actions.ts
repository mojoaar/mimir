'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { audit } from '@/lib/audit'
import { requireUser } from '@/lib/auth/context'
import { deleteMemory, restoreMemory, writeMemory } from '@/lib/memory/service'
import { restoreVersion } from '@/lib/memory/versions'
import { translator } from '@/lib/i18n/request'
import { flagError } from '@/lib/http/action-error'

export type ActionState = { ok?: string; error?: string }

function field(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

export async function saveMemoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const projectId = field(formData, 'projectId')
  const slug = field(formData, 'slug')
  const path = field(formData, 'path')
  const body = field(formData, 'body')
  const title = field(formData, 'title')

  try {
    await writeMemory({ userId: user.id, projectId, path, body, title: title || undefined, source: 'web' })
    await audit({
      actorType: 'user',
      actorId: user.id,
      action: 'memory.write',
      targetType: 'memory',
      targetId: path,
      detail: { via: 'web' },
    })
    revalidatePath(`/app/projects/${slug}`)
    const t = await translator()
    return { ok: t('app.browse.saved') }
  } catch (error) {
    const t = await translator()
    return { error: flagError(error, t, t('app.error.generic')) }
  }
}

export async function deleteMemoryAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const slug = field(formData, 'slug')
  const projectId = field(formData, 'projectId')
  const path = field(formData, 'path')

  const deleted = await deleteMemory(user.id, projectId, path)
  if (deleted) {
    await audit({
      actorType: 'user',
      actorId: user.id,
      action: 'memory.delete',
      targetType: 'memory',
      targetId: path,
      detail: { via: 'web' },
    })
  }
  revalidatePath(`/app/projects/${slug}`)
  redirect(`/app/projects/${slug}?deleted=1`)
}

export async function restoreMemoryAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const slug = field(formData, 'slug')
  const projectId = field(formData, 'projectId')
  const path = field(formData, 'path')

  const result = await restoreMemory(user.id, projectId, path)
  revalidatePath(`/app/projects/${slug}`)

  if (!result.restored) {
    const t = await translator()
    const reason = result.reason === 'conflict' ? t('app.project.restoreConflict') : t('app.project.restoreGone')
    redirect(`/app/projects/${slug}?deleted=1&error=${encodeURIComponent(reason)}`)
  }

  await audit({
    actorType: 'user',
    actorId: user.id,
    action: 'memory.restore',
    targetType: 'memory',
    targetId: path,
    detail: { via: 'web' },
  })
  redirect(`/app/projects/${slug}?path=${encodeURIComponent(path)}`)
}

export async function restoreVersionAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const slug = field(formData, 'slug')
  const projectId = field(formData, 'projectId')
  const path = field(formData, 'path')
  const versionId = field(formData, 'versionId')

  const result = await restoreVersion(user.id, projectId, versionId)
  revalidatePath(`/app/projects/${slug}`)

  const t = await translator()
  if (!result.restored) {
    redirect(
      `/app/projects/${slug}?path=${encodeURIComponent(path)}&history=1&error=${encodeURIComponent(t('app.browse.versionGone'))}`,
    )
  }

  await audit({
    actorType: 'user',
    actorId: user.id,
    action: 'memory.restore_version',
    targetType: 'memory',
    targetId: result.path,
    detail: { via: 'web', versionId },
  })
  redirect(
    `/app/projects/${slug}?path=${encodeURIComponent(result.path)}&history=1&notice=${encodeURIComponent(t('app.browse.restored'))}`,
  )
}
