import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  request: vi.fn(async () => {}),
  email: null as null | { enabled: boolean },
  allowed: true,
  counted: 0,
}))

vi.mock('@/lib/auth/tokens', () => ({ requestPasswordReset: mocks.request }))
vi.mock('@/lib/settings/email-settings', () => ({ getEmailSettings: async () => mocks.email }))
vi.mock('@/lib/auth/rate-limit', () => ({
  checkLoginRateLimit: () => ({ allowed: mocks.allowed, retryAfter: 600 }),
  recordLoginFailure: () => {
    mocks.counted += 1
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
  mocks.counted = 0
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
    expect(mocks.counted).toBe(1)
    expect(state.message).toContain('Too many attempts')
  })
})
