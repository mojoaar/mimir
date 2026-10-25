import { cookies, headers } from 'next/headers'
import { getCurrentUser } from '@/lib/auth/context'
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  fromAcceptLanguage,
  isLocale,
  type Locale,
} from './locales'
import { t } from './index'

export type Translate = (key: string, vars?: Record<string, string | number>) => string

/**
 * The signed-in area has one URL per page, so its language lives on the account
 * (and in the cookie that survives a sign-out). Marketing keeps `/da` and `/de`
 * because those pages need real URLs for search engines.
 */
export async function getRequestLocale(): Promise<Locale> {
  // Also called from /login, where there is no session and no request scope in
  // some tests: a failure here must mean "no preference", never a broken page.
  let preferred: string | null = null
  try {
    preferred = (await getCurrentUser())?.locale ?? null
  } catch {
    preferred = null
  }
  if (preferred !== null && isLocale(preferred)) return preferred

  const stored = await readCookie(LOCALE_COOKIE)
  if (isLocale(stored)) return stored

  return fromAcceptLanguage(await readAcceptLanguage()) ?? DEFAULT_LOCALE
}

/** A page rendered outside a request (a unit test, a script) falls back to English. */
async function readCookie(name: string): Promise<string> {
  try {
    return (await cookies()).get(name)?.value ?? ''
  } catch {
    return ''
  }
}

async function readAcceptLanguage(): Promise<string | null> {
  try {
    return (await headers()).get('accept-language')
  } catch {
    return null
  }
}

/** Resolve once per request and hand back a function that already knows the language. */
export async function translator(): Promise<Translate> {
  const locale = await getRequestLocale()
  return (key, vars) => t(locale, key, vars)
}
