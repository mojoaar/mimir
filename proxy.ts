import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from './lib/auth/cookie-name'
import { agentById } from './lib/docs/agents'
import { LOCALE_COOKIE, LOCALES, localeFromPath, type Locale } from './lib/i18n/locales'

// Next 16 streams a dynamic route's shell before notFound() resolves, so an
// unknown [locale] or [agent] answers 200 with a not-found body. A route
// handler can set its own status, so unknown paths are rewritten to this one,
// which answers 404 with the thematic page. The folder name must not start with
// an underscore: Next treats `_name` as a private folder and does not route it.
const SENTINEL = '/api/not-found'

const PUBLIC_ROOTS = new Set([
  'docs',
  'app',
  'api',
  'mcp',
  'login',
  'set-password',
  'forgot-password',
  'health',
  'sitemap.xml',
  'robots.txt',
  'opengraph-image',
])

function rootOf(pathname: string): string {
  return pathname.split('/').filter(Boolean)[0] ?? ''
}

function isKnownPath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean)
  const root = segments[0] ?? ''
  // public/ assets carry an extension; they are served, not routed.
  if (/\.[a-z0-9]+$/i.test(segments.at(-1) ?? '')) return true
  if ((LOCALES as readonly string[]).includes(root)) return true
  if (!PUBLIC_ROOTS.has(root)) return false
  // /docs/agents/<id> is generated per agent; anything else there is not a page.
  if (root === 'docs' && segments[1] === 'agents' && segments[2]) {
    return agentById(segments[2]) !== undefined
  }
  return true
}

// Every locale branch writes the cookie, English included. Without that, picking
// German latches it and going back to English never clears it.
function remember(response: NextResponse, locale: Locale): NextResponse {
  response.cookies.set(LOCALE_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  return response
}

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
    return remember(NextResponse.next(), parsed.locale)
  }
  if (pathname === '/en' || pathname.startsWith('/en/')) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.slice(3) || '/'
    return remember(NextResponse.redirect(url, 308), 'en')
  }
  if (pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/en'
    return remember(NextResponse.rewrite(url), 'en')
  }

  if (!isKnownPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = SENTINEL
    url.search = ''
    return NextResponse.rewrite(url)
  }

  if (rootOf(pathname) === 'app' && !request.cookies.has(SESSION_COOKIE)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  const response = NextResponse.next()
  if (rootOf(pathname) === 'app') response.headers.set('X-Robots-Tag', 'noindex')
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
