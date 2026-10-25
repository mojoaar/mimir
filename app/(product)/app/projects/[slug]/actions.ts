'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { audit, describeAuditFailure } from '@/lib/audit'
import { requireUser } from '@/lib/auth/context'
import { deleteMemory, restoreMemory, writeMemory } from '@/lib/memory/service'
import { restoreVersion } from '@/lib/memory/versions'

export type ActionState = { ok?: string; error?: string }

const KNOWN = new Set(['invalid_path', 'invalid_params', 'body_too_large', 'forbidden', 'not_found'])

function messageOf(error: unknown): string {
  const code = (error as { code?: string }).code ?? ''
  if (KNOWN.has(code)) return (error as Error).message
  console.error('memory action failed', describeAuditFailure(error))
  return 'That did not work. Try again.'
}

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
    return { ok: 'Saved.' }
  } catch (error) {
    return { error: messageOf(error) }
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
    const reason =
      result.reason === 'conflict'
        ? 'That path was written again after it was deleted, so this copy stayed deleted.'
        : 'That memory is no longer in the bin.'
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

  if (!result.restored) {
    redirect(`/app/projects/${slug}?path=${encodeURIComponent(path)}&history=1&error=That%20version%20is%20gone.`)
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
    `/app/projects/${slug}?path=${encodeURIComponent(result.path)}&history=1&notice=Restored.%20The%20previous%20body%20is%20in%20history.`,
  )
}
