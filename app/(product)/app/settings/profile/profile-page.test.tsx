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
  emailCalls: [] as Record<string, unknown>[],
  passwordCalls: 0,
  locale: 'en',
  mfaOn: false,
  mfaRequired: false,
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
vi.mock('@/lib/users/avatar', () => ({ avatarVersion: async () => '9' }))
vi.mock('@/lib/auth/apikey', () => ({ listApiKeys: async () => [] }))
vi.mock('@/lib/config', () => ({
  getConfig: () => ({ publicUrlSeed: 'http://localhost:3000' }),
}))
vi.mock('@/lib/auth/mfa', () => ({
  mfaEnabled: async () => mocks.mfaOn,
  pendingEnrollment: async () => ({ secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' }),
  beginEnrollment: async () => ({ secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' }),
}))
vi.mock('@/lib/settings/security', () => ({ getRequireMfa: async () => mocks.mfaRequired }))
vi.mock('qrcode', () => ({ default: { toString: async () => '<svg></svg>' } }))
// The real one is async and mints a secret; its own behaviour is not what this
// page decides, only where it appears.
vi.mock('../mfa/enrolment', () => ({
  Enrolment: () => <div data-test="enrolment">Scan this with your authenticator app</div>,
}))
vi.mock('../../actions', () => ({ setLocaleAction: async () => {}, signOutAction: async () => {} }))
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
vi.mock('@/lib/users/email-change', () => ({
  requestEmailChange: async (id: string, email: string, password: string) => {
    mocks.emailCalls.push({ id, email, password })
    return { pending: true }
  },
}))

import ProfilePage from './page'
import { changePasswordAction, updateProfileAction } from './actions'

async function render() {
  return renderToStaticMarkup(
    await ProfilePage({ searchParams: Promise.resolve({}) }),
  )
}

vi.mock('@/lib/settings/time', () => ({
  getTimezone: async () => 'UTC',
  getClock: async () => '24h',
  getTimeFormat: async () => ({ timeZone: 'UTC', clock: '24h' }),
  timezoneOptions: () => ['UTC', 'Europe/Copenhagen'],
  defaultTimezone: () => 'UTC',
  setTimezone: async () => {},
  setClock: async () => {},
}))

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

  it('ends with the sessions, after the things you set once', async () => {
    mocks.sessions = [current]

    const html = await render()
    const appearance = html.indexOf('>Appearance</h2>')
    const keys = html.indexOf('>API keys</h2>')
    const sessions = html.indexOf('>Sessions</h2>')

    expect(appearance).toBeGreaterThan(-1)
    expect(keys).toBeGreaterThan(appearance)
    // Revoking a device is the thing you come here for when something feels
    // wrong, so it sits last rather than interrupting the settings above.
    expect(sessions).toBeGreaterThan(keys)
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

describe('the two-factor section', () => {
  it('keeps the setup collapsed, because it draws a new QR every render', async () => {
    mocks.sessions = []
    mocks.mfaOn = false

    const html = await render()

    expect(html).toContain('<details')
    expect(html).toContain('data-test="enrolment"')
    expect(html).not.toContain('Turn off')
  })

  it('offers to turn it off once it is on', async () => {
    mocks.sessions = []
    mocks.mfaOn = true
    mocks.mfaRequired = false

    const html = await render()

    expect(html).toContain('Turn off')
    expect(html).not.toContain('Scan this')
  })

  it('explains why turning it off is refused when the install requires it', async () => {
    mocks.sessions = []
    mocks.mfaOn = true
    mocks.mfaRequired = true

    try {
      expect(await render()).toContain('turning it off is disabled')
    } finally {
      mocks.mfaRequired = false
      mocks.mfaOn = false
    }
  })
})

describe('appearance and keys', () => {
  it('carries the language, theme and API key controls', async () => {
    mocks.sessions = []

    const html = await render()

    expect(html).toContain('Appearance')
    expect(html).toContain('name="locale"')
    expect(html).toContain('English')
    expect(html).toContain('API keys')
    expect(html).toContain('http://localhost:3000/mcp')
  })

  it('speaks Danish when the account does', async () => {
    mocks.sessions = []
    mocks.locale = 'da'

    try {
      expect(await render()).toContain('Udseende')
    } finally {
      mocks.locale = 'en'
    }
  })
})

describe('the picture', () => {
  it('offers an upload that becomes a round icon', async () => {
    mocks.sessions = [current]

    const html = await render()

    expect(html).toContain('type="file"')
    expect(html).toContain('name="avatar"')
    expect(html).toContain('image/png')
    expect(html).toContain('/app/avatar?v=9')
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

  it('asks for confirmation instead of moving the address at once', async () => {
    mocks.profileCalls = []
    mocks.emailCalls = []

    const state = await updateProfileAction(
      {},
      form({ name: 'Alice', email: 'new@example.test', currentPassword: 'correct-password' }),
    )

    expect(state.ok).toContain('Check the new address')
    // The name still saves; only the address waits for the mail.
    expect(mocks.profileCalls[0]).toEqual({ name: 'Alice' })
    expect(mocks.emailCalls[0]).toMatchObject({
      email: 'new@example.test',
      password: 'correct-password',
    })
  })

  it('still saves a name on its own', async () => {
    mocks.profileCalls = []

    const state = await updateProfileAction({}, form({ name: 'Alice B', email: 'alice@example.test' }))

    expect(state.ok).toBe('Saved.')
    expect(mocks.profileCalls[0]).toEqual({ name: 'Alice B' })
  })

  it('keeps the name when the address changes in the same submit', async () => {
    mocks.profileCalls = []
    mocks.emailCalls = []

    const state = await updateProfileAction(
      {},
      form({ name: 'Alice B', email: 'alice.new@example.test', currentPassword: 'dev-password-123' }),
    )

    expect(state.ok).toContain('Check the new address')
    expect(mocks.profileCalls[0]).toEqual({ name: 'Alice B' })
    expect(mocks.emailCalls).toHaveLength(1)
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
