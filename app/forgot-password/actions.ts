'use server'

import { checkLoginRateLimit, recordLoginFailure } from '@/lib/auth/rate-limit'
import { requestPasswordReset } from '@/lib/auth/tokens'
import { getEmailSettings } from '@/lib/settings/email-settings'

export type ResetState = { message: string }

// A 'use server' module may only export async functions, so this stays local.
const NEUTRAL_MESSAGE = 'If that address has an account, we sent a link to set a new password.'
const NO_EMAIL = ' Email is not configured on this server — ask your admin for the link.'
const THROTTLED = 'Too many attempts. Try again in a few minutes.'
const EMPTY = 'Enter the address you sign in with.'

export async function requestResetAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const email = String(formData.get('email') ?? '').trim()
  if (!email) return { message: EMPTY }

  const limit = checkLoginRateLimit(email)
  if (!limit.allowed) {
    recordLoginFailure(email)
    return { message: THROTTLED }
  }

  await requestPasswordReset(email)

  // The same answer either way: whether an account exists is not the caller's business.
  const emailSettings = await getEmailSettings()
  return { message: emailSettings ? NEUTRAL_MESSAGE : NEUTRAL_MESSAGE + NO_EMAIL }
}
