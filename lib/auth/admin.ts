import { redirect } from 'next/navigation'
import { getCurrentUser } from './context'
import type { AuthUser } from './types'

/**
 * The admin gate. It lives in the /app/admin layout so every admin route
 * inherits it, rather than each page remembering to ask.
 */
export async function requireAdmin(): Promise<AuthUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/app')
  return user
}
