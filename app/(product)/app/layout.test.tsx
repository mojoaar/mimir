import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  role: 'user' as 'user' | 'admin',
  email: 'alice@example.test',
  locale: 'en',
  spike: null as null | { calls: number; median: number; hourStart: string },
}))

vi.mock('@/lib/usage/service', () => ({
  spike: async () => state.spike,
  dismissed: async () => false,
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
    locale: state.locale,
  }),
  getCurrentUser: async () => ({
    id: 'u1',
    email: state.email,
    role: state.role,
    name: 'Alice',
    status: 'active',
    mfaEnabled: true,
    locale: state.locale,
  }),
}))
vi.mock('@/lib/users/avatar', () => ({ avatarVersion: async () => '7' }))
vi.mock('@/lib/auth/mfa', () => ({ mfaEnabled: async () => true }))
vi.mock('@/lib/http/allowlist', () => ({ isRequestAllowed: async () => true }))
vi.mock('@/lib/settings/security', () => ({ getRequireMfa: async () => false }))
vi.mock('@/lib/config', () => ({ getConfig: () => ({ adminEmail: null }) }))

import AppLayout from './layout'

beforeEach(() => {
  state.role = 'user'
  state.email = 'alice@example.test'
  state.locale = 'en'
  state.spike = null
})

describe('the app shell', () => {
  it('offers a way out from every page', async () => {
    const html = renderToStaticMarkup(await AppLayout({ children: <p>body</p> }))

    expect(html).toContain('body')
    expect(html).toContain('alice@example.test')
    // The account name is the menu: profile and sign-out live behind it.
    expect(html).toContain('/app/avatar?v=7')
    expect(html).toContain('<details')
    expect(html).toContain('Your profile')
    expect(html).toContain('Sign out')
    // The select needs a real submit control, or the one control that
    // changes the whole interface stops working without JavaScript.
    expect(html).toContain('type="submit"')
  })

  it('keeps every link a signed-in person needs, including the docs', async () => {
    const html = renderToStaticMarkup(await AppLayout({ children: <p>body</p> }))

    for (const href of [
      'href="/app"',
      'href="/app/teams"',
      'href="/app/settings/providers"',
    ]) {
      expect(html).toContain(href)
    }

    // Docs is reachable from the footer, not from the nav.
    expect(html).toContain('href="/docs"')
  })

  it('puts the mark beside the first destination', async () => {
    const html = renderToStaticMarkup(await AppLayout({ children: <p>body</p> }))

    expect(html).toContain('text-[var(--logo-ink)]')
    expect(html).toContain('aria-label="Mimir"')
  })



  it('speaks the language saved on the account', async () => {
    state.locale = 'da'
    const html = renderToStaticMarkup(await AppLayout({ children: <p>body</p> }))

    expect(html).toContain('Projekter')
    expect(html).toContain('Log ud')
    expect(html).not.toContain('>Projects<')
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

  it('warns an admin about a spike and lets them dismiss it', async () => {
    state.role = 'admin'
    state.spike = { calls: 40, median: 2, hourStart: '2026-10-26T09:00:00Z' }

    const html = renderToStaticMarkup(await AppLayout({ children: <p>body</p> }))

    expect(html).toContain('Usage spike · 40 calls this hour')
    expect(html).toContain('aria-label="Dismiss the spike"')
  })

  it('never shows the spike to a normal user', async () => {
    state.spike = { calls: 40, median: 2, hourStart: '2026-10-26T09:00:00Z' }

    const html = renderToStaticMarkup(await AppLayout({ children: <p>body</p> }))

    expect(html).not.toContain('Usage spike')
  })
})
