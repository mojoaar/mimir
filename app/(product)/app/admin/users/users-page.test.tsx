import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listUsers: vi.fn(),
  locale: 'en',
}))

vi.mock('@/lib/auth/context', () => ({
  getCurrentUser: async () => ({
    id: 'admin-1',
    email: 'admin@example.test',
    name: 'Admin',
    role: 'admin',
    status: 'active',
    mfaEnabled: false,
    locale: mocks.locale,
  }),
}))

vi.mock('@/lib/auth/admin', () => ({
  requireAdmin: async () => ({
    id: 'admin-1',
    email: 'admin@example.test',
    name: 'Admin',
    role: 'admin',
    status: 'active',
    mfaEnabled: false,
  }),
}))

vi.mock('@/lib/users/service', () => ({
  listUsers: mocks.listUsers,
}))

vi.mock('@/lib/settings/site', () => ({
  getSiteSettings: async () => ({
    siteName: 'Mimir',
    publicUrl: 'http://localhost:3000',
    metaDescription: '',
  }),
}))

import UsersPage from './page'

describe('the users page', () => {
  it('lists users with their status and offers to create one', async () => {
    mocks.listUsers.mockResolvedValue({
      total: 2,
      rows: [
        {
          id: 'admin-1',
          email: 'admin@example.test',
          name: 'Admin',
          role: 'admin',
          status: 'active',
          mfaEnabled: false,
          lastLoginAt: null,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          projectCount: 0,
        },
        {
          id: 'user-2',
          email: 'pending@example.test',
          name: 'Pending Person',
          role: 'user',
          status: 'pending',
          mfaEnabled: false,
          lastLoginAt: null,
          createdAt: new Date('2026-01-02T00:00:00Z'),
          projectCount: 1,
        },
      ],
    })

    const html = renderToStaticMarkup(await UsersPage({ searchParams: Promise.resolve({}) }))

    expect(html).toContain('admin@example.test')
    expect(html).toContain('pending@example.test')
    expect(html).toContain('Pending')
    expect(html).toContain('Create user')
    expect(html).not.toContain('password_hash')
    expect(html).not.toContain('totp_secret_enc')
  })

  it('speaks the language saved on the account', async () => {
    mocks.locale = 'da'
    mocks.listUsers.mockResolvedValue({ total: 0, rows: [] })

    try {
      const html = renderToStaticMarkup(await UsersPage({ searchParams: Promise.resolve({}) }))

      expect(html).toContain('Opret bruger')
      expect(html).toContain('Ingen brugere matcher det filter.')
    } finally {
      mocks.locale = 'en'
    }
  })

  it('passes the filter to the service', async () => {
    mocks.listUsers.mockResolvedValue({ total: 0, rows: [] })

    await UsersPage({ searchParams: Promise.resolve({ status: 'disabled' }) })

    expect(mocks.listUsers).toHaveBeenCalledWith({ query: undefined, status: 'disabled' })
  })
})
