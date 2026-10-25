'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireUser } from '@/lib/auth/context'
import { translator } from '@/lib/i18n/request'
import { actionMessage } from '@/lib/i18n/errors'
import { addTeamMember, createTeam, deleteTeam, leaveTeam, removeTeamMember, renameTeam } from '@/lib/teams/service'

export type ActionState = { ok?: string; error?: string }

const KNOWN = new Set(['forbidden', 'invalid_params', 'not_found'])

async function messageOf(error: unknown): Promise<string> {
  return actionMessage(error, await translator())
}

export async function createTeamAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  const t = await translator()
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: t('app.teams.needName') }

  let id: string
  try {
    const team = await createTeam(user.id, name)
    id = team.id
  } catch (error) {
    return { error: await messageOf(error) }
  }

  revalidatePath('/app/teams')
  redirect(`/app/teams/${id}`)
}

export async function addMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  const t = await translator()
  const teamId = String(formData.get('teamId') ?? '')
  const email = String(formData.get('email') ?? '').trim()
  if (!teamId || !email) return { error: t('app.teams.needEmail') }

  try {
    await addTeamMember(user.id, teamId, email)
  } catch (error) {
    return { error: await messageOf(error) }
  }

  revalidatePath(`/app/teams/${teamId}`)
  return { ok: t('app.teams.added', { email }) }
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const teamId = String(formData.get('teamId') ?? '')
  const userId = String(formData.get('userId') ?? '')

  try {
    await removeTeamMember(user.id, teamId, userId)
  } catch (error) {
    // The redirect sits outside the try: a thrown redirect is not a failure.
    redirect(`/app/teams/${teamId}?error=${encodeURIComponent(await messageOf(error))}`)
  }

  revalidatePath(`/app/teams/${teamId}`)
  redirect(`/app/teams/${teamId}?notice=removed`)
}

export async function deleteTeamAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const teamId = String(formData.get('teamId') ?? '')

  try {
    await deleteTeam(user.id, teamId)
  } catch (error) {
    redirect(`/app/teams/${teamId}?error=${encodeURIComponent(await messageOf(error))}`)
  }

  revalidatePath('/app/teams')
  redirect('/app/teams?notice=deleted')
}

export async function leaveTeamAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const teamId = String(formData.get('teamId') ?? '')

  try {
    await leaveTeam(user.id, teamId)
  } catch (error) {
    redirect(`/app/teams/${teamId}?error=${encodeURIComponent(await messageOf(error))}`)
  }

  revalidatePath('/app/teams')
  redirect('/app/teams?notice=left')
}

export async function renameTeamAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  const t = await translator()
  const teamId = String(formData.get('teamId') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: t('app.teams.needName') }

  try {
    await renameTeam(user.id, teamId, name)
  } catch (error) {
    return { error: await messageOf(error) }
  }

  revalidatePath(`/app/teams/${teamId}`)
  return { ok: t('app.teams.renamed') }
}
