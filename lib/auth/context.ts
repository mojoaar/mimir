import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE } from './cookie-name'
import { resolveSession } from './session'
import { isRequestAllowed } from '@/lib/http/allowlist'
import type { AuthUser } from './types'

/**
 * Resolving a session is the one choke point every authenticated surface passes
 * through — pages, server actions, route handlers. The allowlist is checked
 * here because a server action can run without any layout being rendered, so a
 * layout-level check would leave mutations open to a blocked network.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const store = await cookies()
  const value = store.get(SESSION_COOKIE)?.value
  if (!value) return null
  if (!(await isRequestAllowed({ headers: await headers() }))) return null
  return resolveSession(value)
}

/** The real gate. Middleware only proves a cookie exists; this proves it works. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}
