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
  profileCalls: [] as Record<string, unknown>[],
  passwordCalls: 0,
  locale: 'en',
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'cookie-1' }) }),
}))
vi.mock('@/lib/auth/context', () => ({
  requireUser: async () => mocks.user,
  getCurrentUser: async () => ({ ...mocks.user, locale: mocks.locale }),
}))
vi.mock('@/lib/auth/session', () => ({ sessionIdFor: async () => 's1' }))
vi.mock('@/lib/auth/cookie-name', () => ({ SESSION_COOKIE: 'mimir_session' }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/users/self', () => ({
  listMySessions: async () => mocks.sessions,
  updateProfile: async (_id: string, patch: Record<string, unknown>) => {
    mocks.profileCalls.push(patch)
    return mocks.user
  },
  changePassword: async () => {
    mocks.passwordCalls += 1
  },
  revokeOwnSession: async () => {},
}))

import ProfilePage from './page'
import { changePasswordAction, updateProfileAction } from './actions'

async function render() {
  return renderToStaticMarkup(
    await ProfilePage({ searchParams: Promise.resolve({}) }),
  )
}

describe('the profile page', () => {
  it('speaks the language saved on the account', async () => {
    mocks.locale = 'da'
    mocks.sessions = [current]

    try {
      const html = await render()

      expect(html).toContain('Din profil')
      expect(html).toContain('Skift adgangskode')
      expect(html).toContain('Denne session')
    } finally {
      mocks.locale = 'en'
    }
  })

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

const current = {
  id: 's1',
  ip: '127.0.0.1',
  userAgent: 'Firefox',
  lastSeenAt: new Date('2026-10-25T10:00:00Z'),
  createdAt: new Date('2026-10-25T09:00:00Z'),
  current: true,
}

const other = (id: string, ip: string) => ({
  id,
  ip,
  userAgent: 'Safari',
  lastSeenAt: new Date('2026-10-24T10:00:00Z'),
  createdAt: new Date('2026-10-24T09:00:00Z'),
  current: false,
})

describe('the picture', () => {
  it('offers an upload that becomes a round icon', async () => {
    mocks.sessions = [current]

    const html = await render()

    expect(html).toContain('type="file"')
    expect(html).toContain('name="avatar"')
    expect(html).toContain('image/png')
    expect(html).toContain('src="/app/avatar"')
    expect(html).toContain('rounded-full')
  })
})

describe('the sessions list', () => {
  it('offers no sign-out-everywhere button when this is the only session', async () => {
    mocks.sessions = [current]

    const html = await render()

    expect(html).not.toContain('Sign out everywhere else')
    expect(html).not.toContain('name="sessionId"')
  })

  it('offers it once there is another device to sign out', async () => {
    mocks.sessions = [current, other('s2', '10.0.0.9')]

    const html = await render()

    expect(html).toContain('Sign out everywhere else')
  })

  it('posts one revoke form per other device, and none for this one', async () => {
    mocks.sessions = [current, other('s2', '10.0.0.9'), other('s3', '10.0.0.10')]

    const html = await render()

    expect(html).toContain('value="s2"')
    expect(html).toContain('value="s3"')
    expect(html).not.toContain('value="s1"')
    expect(html.match(/name="sessionId"/g)).toHaveLength(2)
  })
})

describe('the profile action', () => {
  function form(fields: Record<string, string>): FormData {
    const data = new FormData()
    for (const [key, value] of Object.entries(fields)) data.set(key, value)
    return data
  }

  it('asks for the current password before moving the address', async () => {
    mocks.profileCalls = []

    const state = await updateProfileAction(
      {},
      form({ name: 'Alice', email: 'new@example.test', currentPassword: '' }),
    )

    expect(state.error).toContain('current password')
    expect(mocks.profileCalls).toHaveLength(0)
  })

  it('passes the new address and the password that allows it', async () => {
    mocks.profileCalls = []

    const state = await updateProfileAction(
      {},
      form({ name: 'Alice', email: 'new@example.test', currentPassword: 'correct-password' }),
    )

    expect(state.ok).toBe('Saved.')
    expect(mocks.profileCalls[0]).toMatchObject({
      name: 'Alice',
      email: 'new@example.test',
      currentPassword: 'correct-password',
    })
  })

  it('refuses a password change whose confirmation differs', async () => {
    mocks.passwordCalls = 0

    const state = await changePasswordAction(
      {},
      form({ current: 'old', new: 'a-brand-new-pass', confirm: 'a-brand-new-pas' }),
    )

    expect(state.error).toContain('do not match')
    expect(mocks.passwordCalls).toBe(0)
  })
})
