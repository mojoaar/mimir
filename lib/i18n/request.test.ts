import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  language: null as string | null,
  user: null as { locale: string } | null,
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (state.cookie ? { value: state.cookie } : undefined) }),
  headers: async () => ({ get: () => state.language }),
}))

vi.mock('@/lib/auth/context', () => ({
  getCurrentUser: async () => state.user,
}))

import { getRequestLocale, translator } from './request'
import { MESSAGES } from './index'

describe('the language of a request', () => {
  beforeEach(() => {
    state.cookie = undefined
    state.language = null
    state.user = null
  })

  it('takes the account preference when there is a signed-in user', async () => {
    state.user = { locale: 'da' }
    expect(await getRequestLocale()).toBe('da')
  })

  it('lets the account beat the cookie and the browser', async () => {
    state.user = { locale: 'da' }
    state.cookie = 'de'
    state.language = 'de-DE,de;q=0.9'
    expect(await getRequestLocale()).toBe('da')
  })

  it('falls through an unknown account locale to the cookie', async () => {
    state.user = { locale: '' }
    state.cookie = 'de'
    expect(await getRequestLocale()).toBe('de')
  })

  it('reads the cookie for a visitor who is not signed in', async () => {
    state.cookie = 'da'
    expect(await getRequestLocale()).toBe('da')
  })

  it('reads the browser language when nothing is stored', async () => {
    state.language = 'de-DE,de;q=0.9,en;q=0.5'
    expect(await getRequestLocale()).toBe('de')
  })

  it('answers english when there is nothing to go on', async () => {
    expect(await getRequestLocale()).toBe('en')
  })

  it('ignores a browser language it does not speak', async () => {
    state.language = 'fr-FR,fr;q=0.9'
    expect(await getRequestLocale()).toBe('en')
  })

  it('hands back a translator bound to the request language', async () => {
    const da = MESSAGES.da as Record<string, string>
    da['app.test.greet'] = 'Hej {name}'
    state.cookie = 'da'

    const t = await translator()
    expect(t('app.test.greet', { name: 'Ada' })).toBe('Hej Ada')
    delete da['app.test.greet']
  })
})
