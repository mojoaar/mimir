import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE } from './cookie-name'
import { resolveSession } from './session'
import type { AuthUser } from './types'

export async function getCurrentUser(): Promise<AuthUser | null> {
  const store = await cookies()
  const value = store.get(SESSION_COOKIE)?.value
  if (!value) return null
  return resolveSession(value)
}

/** The real gate. Middleware only proves a cookie exists; this proves it works. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}
