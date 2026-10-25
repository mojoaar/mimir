'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/auth/cookie-name'
import { authenticate } from '@/lib/auth/login'
import { getConfig } from '@/lib/config'
import { clientIp } from '@/lib/http/ip'

export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  const requestHeaders = await headers()
  // Next does not expose the socket peer, so the trusted-proxy list is the
  // proof that X-Forwarded-For came from our own proxy (see lib/http/ip.ts).
  const ip = clientIp(requestHeaders, getConfig().trustedProxies, null)

  const result = await authenticate(email, password, {
    ip,
    userAgent: requestHeaders.get('user-agent'),
  })

  if (!result.ok) redirect(`/login?error=${result.reason}`)

  const store = await cookies()
  store.set(SESSION_COOKIE, result.cookieValue, SESSION_COOKIE_OPTIONS)
  redirect('/app')
}
