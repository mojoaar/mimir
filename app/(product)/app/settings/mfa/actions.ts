'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/context'
import { confirmEnrollment, disableMfaForUser } from '@/lib/auth/mfa'

export type MfaState = { error?: string; ok?: string }

export async function confirmMfaAction(prev: MfaState, formData: FormData): Promise<MfaState> {
  const user = await requireUser()
  const code = String(formData.get('code') ?? '').trim()

  if (!/^\d{6}$/.test(code)) return { error: 'Enter the six-digit code.' }

  const result = await confirmEnrollment(user.id, code)
  if (!result.ok) {
    return {
      error:
        result.reason === 'no_pending'
          ? 'That setup expired. Reload the page.'
          : 'That code is not right. Check the clock on your device and try again.',
    }
  }

  revalidatePath('/app')
  revalidatePath('/app/settings/mfa')
  return { ok: 'Two-factor authentication is on.' }
}

export async function disableMfaAction(): Promise<void> {
  const user = await requireUser()
  try {
    await disableMfaForUser(user.id)
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'forbidden') redirect('/app/settings/mfa?error=required')
    throw error
  }

  revalidatePath('/app')
  revalidatePath('/app/settings/mfa')
  redirect('/app/settings/mfa?notice=off')
}
