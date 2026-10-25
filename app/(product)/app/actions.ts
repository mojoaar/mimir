'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { SESSION_COOKIE } from '@/lib/auth/cookie-name'
import { revokeSession } from '@/lib/auth/session'
import { requireUser } from '@/lib/auth/context'
import { updateMyLocale } from '@/lib/users/locale'
import { LOCALE_COOKIE, isLocale } from '@/lib/i18n/locales'

export async function signOutAction(): Promise<void> {
  const store = await cookies()
  const value = store.get(SESSION_COOKIE)?.value
  if (value) await revokeSession(value)
  store.delete(SESSION_COOKIE)
  redirect('/login')
}

export async function setLocaleAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const locale = String(formData.get('locale') ?? '')
  if (!isLocale(locale)) redirect('/app')

  await updateMyLocale(user.id, locale)

  // The cookie keeps the choice for the sign-in page and any other surface a
  // signed-out browser sees. The account column is what follows the person.
  const store = await cookies()
  store.set(LOCALE_COOKIE, locale, {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: false,
  })

  revalidatePath('/app', 'layout')
  redirect('/app')
}
