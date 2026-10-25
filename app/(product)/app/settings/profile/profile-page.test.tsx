import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  user: {
    id: 'u1',
    email: 'alice@example.test',
    name: 'Alice',
    role: 'user',
    status: 'active',
    mfaEnabled: false,
  },
  sessions: [] as unknown[],
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'cookie-1' }) }),
}))
vi.mock('@/lib/auth/context', () => ({ requireUser: async () => mocks.user }))
vi.mock('@/lib/auth/session', () => ({ sessionIdFor: async () => 's1' }))
vi.mock('@/lib/auth/cookie-name', () => ({ SESSION_COOKIE: 'mimir_session' }))
vi.mock('@/lib/users/self', () => ({
  listMySessions: async () => mocks.sessions,
  updateProfile: async () => mocks.user,
  changePassword: async () => {},
  revokeOwnSession: async () => {},
}))

import ProfilePage from './page'

async function render() {
  return renderToStaticMarkup(
    await ProfilePage({ searchParams: Promise.resolve({}) }),
  )
}

describe('the profile page', () => {
  it('shows the name and email in an editable form', async () => {
    mocks.sessions = []

    const html = await render()

    expect(html).toContain('name="name"')
    expect(html).toContain('value="Alice"')
    expect(html).toContain('name="email"')
    expect(html).toContain('alice@example.test')
  })

  it('asks for the current password before the email can change', async () => {
    mocks.sessions = []

    const html = await render()

    expect(html).toContain('name="currentPassword"')
    expect(html).toContain('Current password')
  })

  it('offers a password form with a current, new and confirm field', async () => {
    mocks.sessions = []

    const html = await render()

    expect(html).toContain('name="current"')
    expect(html).toContain('name="new"')
    expect(html).toContain('name="confirm"')
  })

  it('marks the session you are using and leaves the others revocable', async () => {
    mocks.sessions = [
      {
        id: 's1',
        ip: '127.0.0.1',
        userAgent: 'Firefox',
        lastSeenAt: new Date('2026-10-25T10:00:00Z'),
        createdAt: new Date('2026-10-25T09:00:00Z'),
        current: true,
      },
      {
        id: 's2',
        ip: '10.0.0.9',
        userAgent: 'Safari',
        lastSeenAt: new Date('2026-10-24T10:00:00Z'),
        createdAt: new Date('2026-10-24T09:00:00Z'),
        current: false,
      },
    ]

    const html = await render()

    expect(html).toContain('This session')
    expect(html).toContain('10.0.0.9')
    expect(html).toContain('name="sessionId"')
    expect(html).toContain('value="s2"')
    expect(html).not.toContain('value="s1"')
  })
})
