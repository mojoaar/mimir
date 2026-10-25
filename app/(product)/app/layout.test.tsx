import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  role: 'user' as 'user' | 'admin',
  email: 'alice@example.test',
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'nordlys-dark' }) }),
  headers: async () => new Headers(),
}))
vi.mock('@/lib/auth/context', () => ({
  requireUser: async () => ({
    id: 'u1',
    email: state.email,
    role: state.role,
    name: 'Alice',
    status: 'active',
    mfaEnabled: true,
  }),
}))
vi.mock('@/lib/auth/mfa', () => ({ mfaEnabled: async () => true }))
vi.mock('@/lib/http/allowlist', () => ({ isRequestAllowed: async () => true }))
vi.mock('@/lib/settings/security', () => ({ getRequireMfa: async () => false }))
vi.mock('@/lib/config', () => ({ getConfig: () => ({ adminEmail: null }) }))

import AppLayout from './layout'

beforeEach(() => {
  state.role = 'user'
  state.email = 'alice@example.test'
})

describe('the app shell', () => {
  it('offers a way out from every page', async () => {
    const html = renderToStaticMarkup(await AppLayout({ children: <p>body</p> }))

    expect(html).toContain('body')
    expect(html).toContain('Sign out')
    expect(html).toContain('alice@example.test')
  })

  it('keeps every link a signed-in person needs, including the docs', async () => {
    const html = renderToStaticMarkup(await AppLayout({ children: <p>body</p> }))

    for (const href of [
      'href="/app"',
      'href="/app/teams"',
      'href="/app/settings"',
      'href="/app/settings/providers"',
      'href="/docs"',
    ]) {
      expect(html).toContain(href)
    }
  })

  it('keeps the theme switcher beside the navigation', async () => {
    const html = renderToStaticMarkup(await AppLayout({ children: <p>body</p> }))
    expect(html).toContain('<select')
    expect(html).toContain('Nordlys')
  })

  it('shows the admin link only to an admin', async () => {
    state.role = 'admin'
    const asAdmin = renderToStaticMarkup(await AppLayout({ children: <p>body</p> }))
    expect(asAdmin).toContain('href="/app/admin"')
    expect(asAdmin).toContain('>Admin<')

    state.role = 'user'
    const asUser = renderToStaticMarkup(await AppLayout({ children: <p>body</p> }))
    expect(asUser).not.toContain('href="/app/admin"')
  })
})
