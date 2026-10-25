import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { proxy } from './proxy'

const SENTINEL = '/api/not-found'
const SESSION = '__Host-mimir_session'

function get(pathname: string, withSession = false): NextRequest {
  const request = new NextRequest(`https://mimir.test${pathname}`)
  if (withSession) request.cookies.set(SESSION, 'cookie-value')
  return request
}

function rewrittenTo(response: Response): string | null {
  const value = response.headers.get('x-middleware-rewrite')
  return value ? new URL(value).pathname : null
}

describe('proxy', () => {
  it.each(['/fr', '/nope', '/docs/agents/nope'])('answers a real 404 for %s', (path) => {
    expect(rewrittenTo(proxy(get(path)))).toBe(SENTINEL)
  })

  it.each(['/docs', '/docs/agents/codex', '/api/v1/projects', '/mcp', '/forgot-password'])(
    'leaves the known path %s alone',
    (path) => {
      const response = proxy(get(path))

      expect(rewrittenTo(response)).toBeNull()
      expect(response.headers.get('location')).toBeNull()
    },
  )

  it('keeps the locale routes working', () => {
    expect(rewrittenTo(proxy(get('/')))).toBe('/en')
    expect(proxy(get('/en/docs')).headers.get('location')).toMatch(/\/docs$/)
    expect(proxy(get('/da')).status).toBe(200)
  })

  it('still sends an unauthenticated product request to the login page', () => {
    const response = proxy(get('/app/settings'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toMatch(/\/login$/)
  })

  it('does not send a signed-in request to the login page', () => {
    expect(proxy(get('/app/settings', true)).headers.get('location')).toBeNull()
  })

  it('does not gate public pages on the session cookie', () => {
    expect(proxy(get('/docs')).headers.get('location')).toBeNull()
  })
})
