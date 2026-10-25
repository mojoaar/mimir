import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from './lib/auth/cookie-name'

// The edge runtime cannot reach Postgres, so this only proves a session cookie
// exists. A cookie that is present but expired or revoked is caught by
// app/(product)/app/layout.tsx, which calls requireUser(). Keep the split: do
// not put a database check in here, and do not treat this as the auth gate.
export function proxy(request: NextRequest) {
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
  matcher: ['/app', '/app/:path*'],
}
