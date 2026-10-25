'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireUser } from '@/lib/auth/context'
import { addTeamMember, createTeam, deleteTeam, removeTeamMember } from '@/lib/teams/service'

export type ActionState = { ok?: string; error?: string }

const KNOWN: Record<string, string> = {
  forbidden: 'Only a team owner can do that.',
  invalid_params: 'That did not work.',
  not_found: 'That team no longer exists.',
}

function messageOf(error: unknown): string {
  const code = (error as { code?: string }).code ?? ''
  if (KNOWN[code]) return KNOWN[code] as string
  // A service message is written for a person; a stack trace is not.
  const message = (error as Error).message ?? ''
  return message && !message.includes('\n') && message.length < 200 ? message : 'That did not work.'
}

export async function createTeamAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'A team needs a name.' }

  let slug: string
  try {
    const team = await createTeam(user.id, name)
    slug = team.slug
  } catch (error) {
    return { error: messageOf(error) }
  }

  revalidatePath('/app/teams')
  redirect(`/app/teams/${slug}`)
}

export async function addMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  const teamId = String(formData.get('teamId') ?? '')
  const email = String(formData.get('email') ?? '').trim()
  const slug = String(formData.get('slug') ?? '')
  if (!teamId || !email) return { error: 'Enter an email address.' }

  try {
    await addTeamMember(user.id, teamId, email)
  } catch (error) {
    return { error: messageOf(error) }
  }

  revalidatePath(`/app/teams/${slug}`)
  return { ok: `${email} can now see what this team shares.` }
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const teamId = String(formData.get('teamId') ?? '')
  const userId = String(formData.get('userId') ?? '')
  const slug = String(formData.get('slug') ?? '')

  try {
    await removeTeamMember(user.id, teamId, userId)
  } catch (error) {
    // The redirect sits outside the try: a thrown redirect is not a failure.
    redirect(`/app/teams/${slug}?error=${encodeURIComponent(messageOf(error))}`)
  }

  revalidatePath(`/app/teams/${slug}`)
  redirect(`/app/teams/${slug}?notice=removed`)
}

export async function deleteTeamAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const teamId = String(formData.get('teamId') ?? '')
  const slug = String(formData.get('slug') ?? '')

  try {
    await deleteTeam(user.id, teamId)
  } catch (error) {
    redirect(`/app/teams/${slug}?error=${encodeURIComponent(messageOf(error))}`)
  }

  revalidatePath('/app/teams')
  redirect('/app/teams?notice=deleted')
}
