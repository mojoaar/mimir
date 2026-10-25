import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import pkg from '../../package.json'
import AppFooter from './footer'

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}))

vi.mock('@/lib/auth/context', () => ({
  requireUser: async () => ({
    id: 'u1',
    email: 'alice@example.test',
    role: 'user',
    name: 'Alice',
    status: 'active',
    mfaEnabled: true,
  }),
}))
vi.mock('@/lib/auth/mfa', () => ({ mfaEnabled: async () => true }))
vi.mock('@/lib/http/allowlist', () => ({ isRequestAllowed: async () => true }))
vi.mock('@/lib/settings/security', () => ({ getRequireMfa: async () => false }))
vi.mock('@/lib/config', () => ({ getConfig: () => ({ adminEmail: null }) }))
// The app shell asks for the account's picture version; a unit test has no database.
vi.mock('@/lib/users/avatar', () => ({ avatarVersion: async () => '0' }))

import DocsLayout from '../../app/docs/layout'
import AppLayout from '../../app/(product)/app/layout'

describe('the footer', () => {
  it('credits the author and links the project', () => {
    const html = renderToStaticMarkup(<AppFooter />)

    expect(html).toContain('Crafted with')
    expect(html).toContain('Morten Johansen')
    expect(html).toContain('https://github.com/mojoaar/mimir')
    expect(html).toContain('href="/docs"')
    expect(html).toContain('MIT')
    expect(html).toContain(`v${pkg.version}`)
    expect(html).toContain(`© ${new Date().getFullYear()}`)
  })

  it('shows the same version the package carries, not a copy', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(renderToStaticMarkup(<AppFooter />)).toContain(`v${pkg.version}`)
  })
})

describe('where the footer appears', () => {
  it('renders under the app', async () => {
    const html = renderToStaticMarkup(await AppLayout({ children: <p>body</p> }))
    expect(html).toContain('Crafted with')
  })

  it('renders under the docs', async () => {
    const html = renderToStaticMarkup(await DocsLayout({ children: <p>body</p> }))
    expect(html).toContain('Crafted with')
  })
})
