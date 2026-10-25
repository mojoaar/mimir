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
import { clientIp } from '@/lib/http/ip'

async function meta() {
  const requestHeaders = await headers()
  // Next does not expose the socket peer, so the trusted-proxy list is the
  // proof that X-Forwarded-For came from our own proxy (see lib/http/ip.ts).
  return {
    ip: clientIp(requestHeaders, getConfig().trustedProxies, null),
    userAgent: requestHeaders.get('user-agent'),
  }
}

export async function loginAction(formData: FormData): Promise<void> {
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
  const code = String(formData.get('code') ?? '')
  const store = await cookies()
  const userId = readTicket(store.get(MFA_TICKET_COOKIE)?.value ?? '')

  // An expired ticket is not a failed code: send the user back to the start
  // rather than letting them guess at a form that can never succeed.
  if (!userId) redirect('/login?error=expired')

  const result = await completeMfaLogin(userId, code, await meta())
  if (!result.ok) redirect(`/login?step=code&error=${result.reason}`)

  store.set(SESSION_COOKIE, result.cookieValue, SESSION_COOKIE_OPTIONS)
  store.delete(MFA_TICKET_COOKIE)
  redirect('/app')
}

export async function cancelMfaAction(): Promise<void> {
  const store = await cookies()
  store.delete(MFA_TICKET_COOKIE)
  redirect('/login')
}
