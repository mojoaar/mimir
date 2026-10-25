'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireUser } from '@/lib/auth/context'
import { SESSION_COOKIE } from '@/lib/auth/cookie-name'
import { revokeOtherSessions, sessionIdFor } from '@/lib/auth/session'
import { translator } from '@/lib/i18n/request'
import { changePassword, revokeOwnSession, updateProfile } from '@/lib/users/self'

export type ActionState = { ok?: string; error?: string }

const KNOWN = new Set(['forbidden', 'invalid_params', 'not_found'])
const PROFILE = '/app/settings/profile'

async function messageOf(error: unknown): Promise<string> {
  const t = await translator()
  const code = (error as { code?: string }).code ?? ''
  const message = (error as Error).message ?? ''
  // Only our own service errors are written for a person. A driver error
  // carries a SQLSTATE in `code` and text nobody should read.
  if (!KNOWN.has(code) || !message || message.includes('\n') || message.length > 200) {
    return t('app.error.generic')
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
  const t = await translator()
  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim()
  const currentPassword = String(formData.get('currentPassword') ?? '')

  if (!name) return { error: t('app.profile.needName') }
  if (!email) return { error: t('app.profile.needEmail') }

  const changingEmail = email.toLowerCase() !== user.email.toLowerCase()
  if (changingEmail && !currentPassword) {
    return { error: t('app.profile.needCurrentPassword') }
  }

  try {
    await updateProfile(
      user.id,
      changingEmail ? { name, email, currentPassword } : { name },
    )
  } catch (error) {
    return { error: await messageOf(error) }
  }

  revalidatePath(PROFILE)
  revalidatePath('/app')
  return { ok: t('app.profile.saved') }
}

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  const t = await translator()
  const current = String(formData.get('current') ?? '')
  const next = String(formData.get('new') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  if (next !== confirm) return { error: t('app.profile.passwordsDiffer') }

  try {
    await changePassword(user.id, current, next, await sessionId())
  } catch (error) {
    return { error: await messageOf(error) }
  }

  revalidatePath(PROFILE)
  return { ok: t('app.profile.passwordChanged') }
}

export async function revokeSessionAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const id = String(formData.get('sessionId') ?? '')

  try {
    await revokeOwnSession(user.id, id)
  } catch (error) {
    redirect(`${PROFILE}?error=${encodeURIComponent(await messageOf(error))}`)
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
