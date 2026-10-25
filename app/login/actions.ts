'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/auth/cookie-name'
import { authenticatePassword, completeMfaLogin, createLoginSession } from '@/lib/auth/login'
import {
  issueTicket,
  MFA_TICKET_COOKIE,
  MFA_TICKET_COOKIE_OPTIONS,
  readTicket,
} from '@/lib/auth/mfa-ticket'
import { getConfig } from '@/lib/config'
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  recordLoginFailure,
} from '@/lib/auth/rate-limit'
import { clientIp } from '@/lib/http/ip'
import { isRequestAllowed } from '@/lib/http/allowlist'

async function meta() {
  const requestHeaders = await headers()
  // Next does not expose the socket peer, so the trusted-proxy list is the
  // proof that X-Forwarded-For came from our own proxy (see lib/http/ip.ts).
  return {
    ip: clientIp(requestHeaders, getConfig().trustedProxies, null),
    userAgent: requestHeaders.get('user-agent'),
  }
}

/** A blocked address must not even be offered a password form. */
async function blocked(): Promise<boolean> {
  return !(await isRequestAllowed({ headers: await headers() }))
}

export async function loginAction(formData: FormData): Promise<void> {
  if (await blocked()) redirect('/login?error=blocked')
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')
  const request = await meta()

  const result = await authenticatePassword(email, password, request)
  if (!result.ok) redirect(`/login?error=${result.reason}`)

  const store = await cookies()

  if (result.mfaRequired) {
    // A sealed, short-lived ticket instead of the password: the second step
    // never sees a credential it could replay later.
    store.set(MFA_TICKET_COOKIE, issueTicket(result.userId), MFA_TICKET_COOKIE_OPTIONS)
    redirect('/login?step=code')
  }

  const session = await createLoginSession(result.userId, request)
  store.set(SESSION_COOKIE, session.cookieValue, SESSION_COOKIE_OPTIONS)
  redirect('/app')
}

export async function loginMfaAction(formData: FormData): Promise<void> {
  if (await blocked()) redirect('/login?error=blocked')
  const code = String(formData.get('code') ?? '')
  const store = await cookies()
  const userId = readTicket(store.get(MFA_TICKET_COOKIE)?.value ?? '')

  // An expired ticket is not a failed code: send the user back to the start
  // rather than letting them guess at a form that can never succeed.
  if (!userId) redirect('/login?error=expired')

  // A six-digit code is guessable at ~1 in a million per try, which is far too
  // cheap without a limit — the password step's throttle does not cover it.
  const request = await meta()
  const limitKey = `mfa:${userId}`
  const limit = checkLoginRateLimit(request.ip, limitKey)
  if (!limit.allowed) redirect('/login?error=locked')

  const result = await completeMfaLogin(userId, code, request)
  if (!result.ok) {
    recordLoginFailure(request.ip, limitKey)
    redirect(`/login?step=code&error=${result.reason}`)
  }
  clearLoginRateLimit(request.ip, limitKey)

  store.set(SESSION_COOKIE, result.cookieValue, SESSION_COOKIE_OPTIONS)
  store.delete(MFA_TICKET_COOKIE)
  redirect('/app')
}

export async function cancelMfaAction(): Promise<void> {
  const store = await cookies()
  store.delete(MFA_TICKET_COOKIE)
  redirect('/login')
}
