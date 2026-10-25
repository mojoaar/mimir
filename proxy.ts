import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from './lib/auth/cookie-name'
import { LOCALE_COOKIE, localeFromPath } from './lib/i18n/locales'

// The edge runtime cannot reach Postgres, so the session branch only proves a
// cookie exists. A cookie that is present but expired or revoked is caught by
// app/(product)/app/layout.tsx, which calls requireUser(). Keep the split: do
// not put a database check in here, and do not treat this as the auth gate.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Marketing is served from app/[locale]; English is unprefixed, so `/` is
  // rewritten to `/en` and `/en/...` is redirected away to avoid a duplicate.
  const parsed = localeFromPath(pathname)
  if (parsed?.locale === 'da' || parsed?.locale === 'de') {
    const response = NextResponse.next()
    response.cookies.set(LOCALE_COOKIE, parsed.locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    })
    return response
  }
  if (pathname === '/en' || pathname.startsWith('/en/')) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.slice(3) || '/'
    return NextResponse.redirect(url, 308)
  }
  if (pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/en'
    return NextResponse.rewrite(url)
  }

  if (!request.cookies.has(SESSION_COOKIE)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  const response = NextResponse.next()
  response.headers.set('X-Robots-Tag', 'noindex')
  return response
}

export const config = {
  matcher: ['/', '/en', '/en/:path*', '/da', '/de', '/app', '/app/:path*'],
}
