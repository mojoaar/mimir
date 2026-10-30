'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/admin'
import { audit, describeAuditFailure } from '@/lib/audit'
import { deliverToken, setPasswordUrl } from '@/lib/auth/tokens'
import { sendEmail } from '@/lib/email/client'
import { inviteEmail } from '@/lib/email/templates'
import { getPublicUrl, getSiteSettings } from '@/lib/settings/site'
import { translator, type Translate } from '@/lib/i18n/request'
import { actionMessage } from '@/lib/i18n/errors'
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

async function messageOf(error: unknown, t: Translate): Promise<string> {
  // redirect() signals by throwing. Catching it turned every successful action
  // into "That did not work" after the change had already been committed.
  const digest = (error as { digest?: string }).digest
  if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) throw error
  console.error('admin user action failed', describeAuditFailure(error))
  return actionMessage(error, t)
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
  const t = await translator()
  const email = text(formData, 'email')
  const name = text(formData, 'name')
  const role = text(formData, 'role') === 'admin' ? 'admin' : 'user'
  const password = text(formData, 'password')

  if (!email || !email.includes('@')) return { error: t('app.admin.users.errEmail') }
  if (!name) return { error: t('app.admin.users.errName') }

  try {
    const created = await createUser(actor.id, {
      email,
      name,
      role: role as UserRole,
      password: password || undefined,
    })

    if (!created.inviteToken) {
      revalidatePath('/app/admin/users')
      return { ok: t('app.admin.users.created') }
    }

    const url = setPasswordUrl(await getPublicUrl(), created.inviteToken)
    const site = await getSiteSettings()
    const sent = await sendEmail({
      to: email,
      ...inviteEmail({ siteName: site.siteName, link: url, invitedBy: actor.email }),
    })

    revalidatePath('/app/admin/users')
    return sent.ok
      ? { ok: t('app.admin.users.createdInvited') }
      : { ok: t('app.admin.users.created'), link: url }
  } catch (error) {
    return { error: await messageOf(error, t) }
  }
}

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireAdmin()
  const t = await translator()
  const userId = text(formData, 'userId')
  const invitedBy = text(formData, 'email')
  const { getUser } = await import('@/lib/users/service')
  const target = await getUser(userId)
  if (!target) return { error: t('app.admin.users.userGone') }

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
    ? { ok: t('app.admin.users.resetSent') }
    : { ok: t('app.admin.users.emailOff'), link: result.url }
}

export async function resendInviteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireAdmin()
  const t = await translator()
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
      ? { ok: t('app.admin.users.inviteSent', { email }) }
      : { ok: t('app.admin.users.emailOff'), link: delivered.url }
  } catch (error) {
    return { error: await messageOf(error, t) }
  }
}

export async function verifyUserAction(_prev: ActionState, formData: FormData): Promise<void> {
  const actor = await requireAdmin()
  const t = await translator()
  try {
    await verifyUser(actor.id, text(formData, 'id'))
    back({ notice: t('app.admin.users.verified') })
  } catch (error) {
    back({ error: await messageOf(error, t) })
  }
}

export async function enableUserAction(_prev: ActionState, formData: FormData): Promise<void> {
  const actor = await requireAdmin()
  const t = await translator()
  try {
    await enableUser(actor.id, text(formData, 'id'))
    back({ notice: t('app.admin.users.enabled') })
  } catch (error) {
    back({ error: await messageOf(error, t) })
  }
}

export async function disableUserAction(_prev: ActionState, formData: FormData): Promise<void> {
  const actor = await requireAdmin()
  const t = await translator()
  try {
    await disableUser(actor.id, text(formData, 'id'))
    back({ notice: t('app.admin.users.disabled') })
  } catch (error) {
    back({ error: await messageOf(error, t) })
  }
}

export async function setRoleAction(_prev: ActionState, formData: FormData): Promise<void> {
  const actor = await requireAdmin()
  const t = await translator()
  const role = text(formData, 'role') === 'admin' ? 'admin' : 'user'
  try {
    await setUserRole(actor.id, text(formData, 'id'), role as UserRole)
    back({ notice: t('app.admin.users.roleChanged', { role: t(`app.admin.users.role${role === 'admin' ? 'Admin' : 'User'}`) }) })
  } catch (error) {
    back({ error: await messageOf(error, t) })
  }
}

export async function resetMfaAction(_prev: ActionState, formData: FormData): Promise<void> {
  const actor = await requireAdmin()
  const t = await translator()
  try {
    await resetMfaForUser(actor.id, text(formData, 'id'))
    back({ notice: t('app.admin.users.mfaReset') })
  } catch (error) {
    back({ error: await messageOf(error, t) })
  }
}

export async function deleteUserAction(_prev: ActionState, formData: FormData): Promise<void> {
  const actor = await requireAdmin()
  const t = await translator()
  const email = text(formData, 'email')
  if (text(formData, 'confirmEmail') !== email) {
    back({ error: t('app.admin.users.confirmMismatch') })
  }

  try {
    await deleteUser(actor.id, text(formData, 'id'), email)
    back({ notice: t('app.admin.users.deleted', { email }) })
  } catch (error) {
    back({ error: await messageOf(error, t) })
  }
}
