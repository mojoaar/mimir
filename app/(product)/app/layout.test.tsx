import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'nordlys-dark' }) }),
  headers: async () => new Headers(),
}))
vi.mock('@/lib/auth/context', () => ({
  requireUser: async () => ({ id: 'u1', email: 'alice@example.test', role: 'user' }),
}))
vi.mock('@/lib/auth/mfa', () => ({ mfaEnabled: async () => true }))
vi.mock('@/lib/http/allowlist', () => ({ isRequestAllowed: async () => true }))
vi.mock('@/lib/settings/security', () => ({ getRequireMfa: async () => false }))
vi.mock('@/lib/config', () => ({ getConfig: () => ({ adminEmail: null }) }))

import AppLayout from './layout'

describe('the app shell', () => {
  it('offers a way out from every page', async () => {
    const html = renderToStaticMarkup(await AppLayout({ children: <p>body</p> }))

    expect(html).toContain('body')
    expect(html).toContain('Sign out')
    expect(html).toContain('alice@example.test')
  })
})
