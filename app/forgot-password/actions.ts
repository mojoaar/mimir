'use server'

import { headers } from 'next/headers'

import { checkResetRateLimit } from '@/lib/auth/rate-limit'
import { isRequestAllowed } from '@/lib/http/allowlist'
import { requestPasswordReset } from '@/lib/auth/tokens'
import { getEmailSettings } from '@/lib/settings/email-settings'
import { translator } from '@/lib/i18n/request'

export type ResetState = { message: string }

export async function requestResetAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  // A 'use server' module may only export async functions, so the words are
  // looked up here rather than kept in module constants.
  const t = await translator()
  const email = String(formData.get('email') ?? '').trim()
  if (!email) return { message: t('app.forgot.empty') }

  if (!(await isRequestAllowed({ headers: await headers() }))) {
    return { message: t('app.forgot.blocked') }
  }

  const limit = checkResetRateLimit(email)
  if (!limit.allowed) return { message: t('app.forgot.throttled') }

  await requestPasswordReset(email)

  // The same answer either way: whether an account exists is not the caller's business.
  const emailSettings = await getEmailSettings()
  return {
    message: emailSettings
      ? t('app.forgot.neutral')
      : t('app.forgot.neutral') + t('app.forgot.noEmail'),
  }
}
