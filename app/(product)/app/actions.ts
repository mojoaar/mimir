'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE } from '@/lib/auth/cookie-name'
import { revokeSession } from '@/lib/auth/session'

export async function signOutAction(): Promise<void> {
  const store = await cookies()
  const value = store.get(SESSION_COOKIE)?.value
  if (value) await revokeSession(value)
  store.delete(SESSION_COOKIE)
  redirect('/login')
}
