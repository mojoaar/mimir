'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/context'
import { confirmEnrollment, disableMfaForUser } from '@/lib/auth/mfa'
import { translator } from '@/lib/i18n/request'

export type MfaState = { error?: string; ok?: string }

export async function confirmMfaAction(prev: MfaState, formData: FormData): Promise<MfaState> {
  const user = await requireUser()
  const t = await translator()
  const code = String(formData.get('code') ?? '').trim()

  if (!/^\d{6}$/.test(code)) return { error: t('app.mfa.needSix') }

  const result = await confirmEnrollment(user.id, code)
  if (!result.ok) {
    return {
      error: result.reason === 'no_pending' ? t('app.mfa.expired') : t('app.mfa.wrongCode'),
    }
  }

  revalidatePath('/app')
  revalidatePath('/app/settings/profile')
  return { ok: t('app.mfa.on') }
}

export async function disableMfaAction(): Promise<void> {
  const user = await requireUser()
  try {
    await disableMfaForUser(user.id)
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'forbidden') redirect('/app/settings/profile?error=required')
    throw error
  }

  revalidatePath('/app')
  revalidatePath('/app/settings/profile')
  redirect('/app/settings/profile?notice=off')
}
