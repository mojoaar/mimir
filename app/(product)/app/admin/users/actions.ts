'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/admin'
import { audit } from '@/lib/audit'
import { deliverToken } from '@/lib/auth/tokens'
import { absoluteLink, sendEmail } from '@/lib/email/client'
import { inviteEmail } from '@/lib/email/templates'
import { getSiteSettings } from '@/lib/settings/site'
import {
  createUser,
  deleteUser,
  disableUser,
  enableUser,
  resetMfaForUser,
  setUserRole,
  verifyUser,
  type UserRole,
} from '@/lib/users/service'

export type ActionState = { ok?: string; error?: string; link?: string }

const KNOWN = new Set(['forbidden', 'invalid_params', 'not_found'])
const GENERIC = 'That did not work. Try again.'

function messageOf(error: unknown): string {
  // redirect() signals by throwing. Catching it turned every successful action
  // into "That did not work" after the change had already been committed.
  const digest = (error as { digest?: string }).digest
  if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) throw error
  const code = (error as { code?: string }).code
  if (code && KNOWN.has(code)) return (error as Error).message
  console.error('admin user action failed', (error as Error).message)
  return GENERIC
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function back(params: Record<string, string>): never {
  revalidatePath('/app/admin/users')
  const search = new URLSearchParams(params).toString()
  redirect(`/app/admin/users${search ? `?${search}` : ''}`)
}

export async function createUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireAdmin()
  const email = text(formData, 'email')
  const name = text(formData, 'name')
  const role = text(formData, 'role') === 'admin' ? 'admin' : 'user'
  const password = text(formData, 'password')

  if (!email || !email.includes('@')) return { error: 'Enter an email address.' }
  if (!name) return { error: 'Enter a name.' }

  try {
    const created = await createUser(actor.id, {
      email,
      name,
      role: role as UserRole,
      password: password || undefined,
    })

    if (!created.inviteToken) {
      revalidatePath('/app/admin/users')
      return { ok: 'User created.' }
    }

    const url = await absoluteLink(`/set-password/${created.inviteToken}`)
    const site = await getSiteSettings()
    const sent = await sendEmail({
      to: email,
      ...inviteEmail({ siteName: site.siteName, link: url, invitedBy: actor.email }),
    })

    revalidatePath('/app/admin/users')
    return sent.ok
      ? { ok: 'User created and invited.' }
      : { ok: 'User created.', link: url }
  } catch (error) {
    return { error: messageOf(error) }
  }
}

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireAdmin()
  const userId = text(formData, 'userId')
  const invitedBy = text(formData, 'email')
  const { getUser } = await import('@/lib/users/service')
  const target = await getUser(userId)
  if (!target) return { error: 'That user no longer exists.' }

  const site = await getSiteSettings()
  const result = await deliverToken({
    userId,
    kind: 'password_reset',
    email: target.email,
    siteName: site.siteName,
    invitedBy: actor.email || invitedBy,
  })
  await audit({
    actorType: 'user',
    actorId: actor.id,
    action: 'admin.password_reset',
    targetType: 'user',
    targetId: userId,
  })
  return result.emailed
    ? { ok: 'Password reset sent.' }
    : { ok: 'Email is not configured — send this link yourself.', link: result.url }
}

export async function resendInviteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireAdmin()
  const userId = text(formData, 'id')
  const email = text(formData, 'email')

  try {
    const site = await getSiteSettings()
    const delivered = await deliverToken({
      userId,
      kind: 'invite',
      email,
      siteName: site.siteName,
      invitedBy: actor.email,
    })
    revalidatePath('/app/admin/users')
    return delivered.emailed
      ? { ok: `Invite sent to ${email}.` }
      : { ok: `Email is not configured — send this link yourself.`, link: delivered.url }
  } catch (error) {
    return { error: messageOf(error) }
  }
}

export async function verifyUserAction(_prev: ActionState, formData: FormData): Promise<void> {
  const actor = await requireAdmin()
  try {
    await verifyUser(actor.id, text(formData, 'id'))
    back({ notice: 'User verified.' })
  } catch (error) {
    back({ error: messageOf(error) })
  }
}

export async function enableUserAction(_prev: ActionState, formData: FormData): Promise<void> {
  const actor = await requireAdmin()
  try {
    await enableUser(actor.id, text(formData, 'id'))
    back({ notice: 'User enabled.' })
  } catch (error) {
    back({ error: messageOf(error) })
  }
}

export async function disableUserAction(_prev: ActionState, formData: FormData): Promise<void> {
  const actor = await requireAdmin()
  try {
    await disableUser(actor.id, text(formData, 'id'))
    back({ notice: 'User disabled and signed out everywhere.' })
  } catch (error) {
    back({ error: messageOf(error) })
  }
}

export async function setRoleAction(_prev: ActionState, formData: FormData): Promise<void> {
  const actor = await requireAdmin()
  const role = text(formData, 'role') === 'admin' ? 'admin' : 'user'
  try {
    await setUserRole(actor.id, text(formData, 'id'), role as UserRole)
    back({ notice: `Role changed to ${role}.` })
  } catch (error) {
    back({ error: messageOf(error) })
  }
}

export async function resetMfaAction(_prev: ActionState, formData: FormData): Promise<void> {
  const actor = await requireAdmin()
  try {
    await resetMfaForUser(actor.id, text(formData, 'id'))
    back({ notice: 'Two-factor reset. The user can enrol again after signing in.' })
  } catch (error) {
    back({ error: messageOf(error) })
  }
}

export async function deleteUserAction(_prev: ActionState, formData: FormData): Promise<void> {
  const actor = await requireAdmin()
  const email = text(formData, 'email')
  if (text(formData, 'confirmEmail') !== email) {
    back({ error: 'Type the email exactly to delete this user.' })
  }

  try {
    await deleteUser(actor.id, text(formData, 'id'), email)
    back({ notice: `${email} deleted.` })
  } catch (error) {
    back({ error: messageOf(error) })
  }
}
