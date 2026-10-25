'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireUser } from '@/lib/auth/context'
import { addTeamMember, createTeam, deleteTeam, leaveTeam, removeTeamMember, renameTeam } from '@/lib/teams/service'

export type ActionState = { ok?: string; error?: string }

const KNOWN = new Set(['forbidden', 'invalid_params', 'not_found'])

function messageOf(error: unknown): string {
  const code = (error as { code?: string }).code ?? ''
  const message = (error as Error).message ?? ''
  // Only our own service errors are written for a person. A driver error
  // carries a SQLSTATE in `code` and text nobody should read.
  if (!KNOWN.has(code) || !message || message.includes('\n') || message.length > 200) {
    return 'That did not work. Try again.'
  }
  return message
}

export async function createTeamAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'A team needs a name.' }

  let id: string
  try {
    const team = await createTeam(user.id, name)
    id = team.id
  } catch (error) {
    return { error: messageOf(error) }
  }

  revalidatePath('/app/teams')
  redirect(`/app/teams/${id}`)
}

export async function addMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  const teamId = String(formData.get('teamId') ?? '')
  const email = String(formData.get('email') ?? '').trim()
  if (!teamId || !email) return { error: 'Enter an email address.' }

  try {
    await addTeamMember(user.id, teamId, email)
  } catch (error) {
    return { error: messageOf(error) }
  }

  revalidatePath(`/app/teams/${teamId}`)
  return { ok: `${email} can now see what this team shares.` }
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const teamId = String(formData.get('teamId') ?? '')
  const userId = String(formData.get('userId') ?? '')

  try {
    await removeTeamMember(user.id, teamId, userId)
  } catch (error) {
    // The redirect sits outside the try: a thrown redirect is not a failure.
    redirect(`/app/teams/${teamId}?error=${encodeURIComponent(messageOf(error))}`)
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
    redirect(`/app/teams/${teamId}?error=${encodeURIComponent(messageOf(error))}`)
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
    redirect(`/app/teams/${teamId}?error=${encodeURIComponent(messageOf(error))}`)
  }

  revalidatePath('/app/teams')
  redirect('/app/teams?notice=left')
}

export async function renameTeamAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  const teamId = String(formData.get('teamId') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'A team needs a name.' }

  try {
    await renameTeam(user.id, teamId, name)
  } catch (error) {
    return { error: messageOf(error) }
  }

  revalidatePath(`/app/teams/${teamId}`)
  return { ok: 'Renamed.' }
}
