import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  request: vi.fn(async () => {}),
  email: null as null | { enabled: boolean },
  allowed: true,
  reachable: true,
  checks: 0,
  locale: 'en' as string,
}))

vi.mock('@/lib/auth/tokens', () => ({ requestPasswordReset: mocks.request }))
vi.mock('@/lib/settings/email-settings', () => ({ getEmailSettings: async () => mocks.email }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined }),
}))
vi.mock('@/lib/auth/context', () => ({
  getCurrentUser: async () => ({ id: 'u1', email: 'a@b.test', locale: mocks.locale }),
}))
vi.mock('@/lib/http/allowlist', () => ({ isRequestAllowed: async () => mocks.reachable }))
vi.mock('@/lib/auth/rate-limit', () => ({
  checkResetRateLimit: () => {
    mocks.checks += 1
    return { allowed: mocks.allowed, retryAfter: 600 }
  },
}))

import ForgotPage from './page'
import { requestResetAction } from './actions'

const NEUTRAL = 'If that address has an account, we sent a link to set a new password.'

function form(email: string): FormData {
  const data = new FormData()
  data.set('email', email)
  return data
}

beforeEach(() => {
  mocks.request.mockClear()
  mocks.email = null
  mocks.allowed = true
  mocks.reachable = true
  mocks.checks = 0
  mocks.locale = 'en'
})

describe('the forgot-password page', () => {
  it('asks for an address and promises nothing', async () => {
    const html = renderToStaticMarkup(await ForgotPage())

    expect(html).toContain('name="email"')
    expect(html).toContain('Send the link')
  })
})

describe('the reset request', () => {
  it('answers the same way whatever the address is', async () => {
    mocks.email = { enabled: true }

    const unknown = await requestResetAction({ message: '' }, form('nobody@example.test'))
    const known = await requestResetAction({ message: '' }, form('alice@example.test'))

    expect(unknown.message).toBe(NEUTRAL)
    expect(known.message).toBe(unknown.message)
  })

  it('asks Mimir to deliver a link for whatever address was given', async () => {
    mocks.email = { enabled: true }

    const state = await requestResetAction({ message: '' }, form('alice@example.test'))

    expect(mocks.request).toHaveBeenCalledWith('alice@example.test')
    expect(state.message).toBe(NEUTRAL)
  })

  it('says so when no mail can be sent', async () => {
    const state = await requestResetAction({ message: '' }, form('alice@example.test'))

    expect(state.message).toContain('Email is not configured on this server')
  })

  it('does not pretend to send when the address is throttled', async () => {
    mocks.allowed = false

    const state = await requestResetAction({ message: '' }, form('alice@example.test'))

    expect(mocks.request).not.toHaveBeenCalled()
    expect(mocks.checks).toBe(1)
    expect(state.message).toContain('Too many attempts')
  })

  it('refuses an address outside the allowlist before doing anything', async () => {
    mocks.reachable = false

    const state = await requestResetAction({ message: '' }, form('alice@example.test'))

    expect(state.message).toContain('not allowed')
    expect(mocks.checks).toBe(0)
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('answers in the language of the reader', async () => {
    mocks.locale = 'da'
    const result = await requestResetAction({ message: '' }, form('alice@example.test'))

    expect(result.message).toContain('har vi sendt et link')
  })
})
