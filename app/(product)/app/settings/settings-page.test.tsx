import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ locale: 'en' }))

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'nordlys-dark' }) }),
}))
vi.mock('@/lib/auth/context', () => ({
  requireUser: async () => ({ id: 'u1', email: 'alice@example.test', locale: mocks.locale }),
  getCurrentUser: async () => ({ id: 'u1', email: 'alice@example.test', locale: mocks.locale }),
}))
vi.mock('@/lib/auth/apikey', () => ({ listApiKeys: async () => [] }))
vi.mock('@/lib/config', () => ({
  getConfig: () => ({ publicUrlSeed: 'http://localhost:3000' }),
}))
vi.mock('../actions', () => ({ setLocaleAction: async () => {}, signOutAction: async () => {} }))

import SettingsPage from './page'

beforeEach(() => {
  mocks.locale = 'en'
})

describe('the settings page', () => {
  it('carries both appearance controls instead of the header', async () => {
    const html = renderToStaticMarkup(await SettingsPage())

    expect(html).toContain('Appearance')
    expect(html).toContain('name="locale"')
    expect(html).toContain('Nordlys')
    expect(html).toContain('English')
    expect(html).toContain('Dansk')
    expect(html).toContain('Deutsch')
  })

  it('speaks Danish when the account does', async () => {
    mocks.locale = 'da'

    const html = renderToStaticMarkup(await SettingsPage())

    expect(html).toContain('Udseende')
    expect(html).toContain('Sprog')
  })
})
