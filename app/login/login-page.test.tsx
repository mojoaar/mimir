import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ locale: 'en' as string }))

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}))
vi.mock('@/lib/auth/context', () => ({
  getCurrentUser: async () => ({ id: 'u1', email: 'a@b.test', locale: state.locale }),
}))
vi.mock('@/lib/http/allowlist', () => ({ isRequestAllowed: async () => true }))

import LoginPage from './page'

const noParams = Promise.resolve({} as { error?: string; step?: string })
const failed = Promise.resolve({ error: 'locked' })

beforeEach(() => {
  state.locale = 'en'
})

describe('the sign-in page', () => {
  it('asks for an email and a password', async () => {
    const html = renderToStaticMarkup(await LoginPage({ searchParams: noParams }))

    expect(html).toContain('Sign in to Mimir')
    expect(html).toContain('name="email"')
    expect(html).toContain('name="password"')
    expect(html).toContain('Forgot your password?')
  })

  it('shows the reason it was given, not a generic failure', async () => {
    const html = renderToStaticMarkup(await LoginPage({ searchParams: failed }))

    expect(html).toContain('Too many attempts')
  })

  it('keeps an unknown reason generic', async () => {
    const html = renderToStaticMarkup(
      await LoginPage({ searchParams: Promise.resolve({ error: '../../etc/passwd' }) }),
    )

    expect(html).toContain('Sign in failed.')
    expect(html).not.toContain('passwd')
  })

  it('speaks the language of the account or the browser', async () => {
    state.locale = 'da'
    const html = renderToStaticMarkup(await LoginPage({ searchParams: failed }))

    expect(html).toContain('Log ind på Mimir')
    expect(html).toContain('For mange forsøg')
    expect(html).toContain('Glemt din adgangskode?')
  })
})
