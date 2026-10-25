'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireUser } from '@/lib/auth/context'
import { SESSION_COOKIE } from '@/lib/auth/cookie-name'
import { revokeOtherSessions, sessionIdFor } from '@/lib/auth/session'
import { changePassword, revokeOwnSession, updateProfile } from '@/lib/users/self'

export type ActionState = { ok?: string; error?: string }

const KNOWN = new Set(['forbidden', 'invalid_params', 'not_found'])
const PROFILE = '/app/settings/profile'

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

async function sessionId(): Promise<string> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value ?? ''
  return (await sessionIdFor(value)) ?? ''
}

export async function updateProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim()
  const currentPassword = String(formData.get('currentPassword') ?? '')

  if (!name) return { error: 'A name is required.' }
  if (!email) return { error: 'An email address is required.' }

  const changingEmail = email.toLowerCase() !== user.email.toLowerCase()
  if (changingEmail && !currentPassword) {
    return { error: 'Enter your current password to change your email address.' }
  }

  try {
    await updateProfile(
      user.id,
      changingEmail ? { name, email, currentPassword } : { name },
    )
  } catch (error) {
    return { error: messageOf(error) }
  }

  revalidatePath(PROFILE)
  revalidatePath('/app')
  return { ok: 'Saved.' }
}

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  const current = String(formData.get('current') ?? '')
  const next = String(formData.get('new') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  if (next !== confirm) return { error: 'The new passwords do not match.' }

  try {
    await changePassword(user.id, current, next, await sessionId())
  } catch (error) {
    return { error: messageOf(error) }
  }

  revalidatePath(PROFILE)
  return { ok: 'Password changed. Every other device is signed out.' }
}

export async function revokeSessionAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const id = String(formData.get('sessionId') ?? '')

  try {
    await revokeOwnSession(user.id, id)
  } catch (error) {
    redirect(`${PROFILE}?error=${encodeURIComponent(messageOf(error))}`)
  }

  revalidatePath(PROFILE)
  redirect(`${PROFILE}?notice=revoked`)
}

export async function signOutEverywhereElseAction(): Promise<void> {
  const user = await requireUser()
  const current = await sessionId()

  await revokeOtherSessions(user.id, current)
  revalidatePath(PROFILE)
  redirect(`${PROFILE}?notice=others`)
}
