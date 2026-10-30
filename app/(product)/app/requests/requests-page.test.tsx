import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  mine: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/auth/context', () => ({
  requireUser: async () => ({
    id: 'u1',
    email: 'bob@example.test',
    role: 'user',
    name: 'Bob',
    status: 'active',
    mfaEnabled: false,
    locale: 'en',
  }),
}))
vi.mock('@/lib/i18n/request', () => ({ translator: async () => (key: string) => key }))
vi.mock('@/lib/projects/requests', () => ({ myAccessRequests: async () => state.mine }))
vi.mock('./actions', () => ({ requestAccessAction: async () => {} }))

import RequestsPage from './page'

const nothing = { searchParams: Promise.resolve({}) }

beforeEach(() => {
  state.mine = []
})

describe('the requests page', () => {
  it('offers a repository field and says nothing is pending yet', async () => {
    const html = renderToStaticMarkup(await RequestsPage(nothing))

    expect(html).toContain('name="repo"')
    expect(html).toContain('name="note"')
    expect(html).toContain('app.requests.empty')
  })

  it('lists a pending request with its repository and a granted one with its answer', async () => {
    state.mine = [
      { id: 'r1', repoKey: 'github.com/alice/shared', note: 'deploy notes', decision: null },
      { id: 'r2', repoKey: 'github.com/alice/old', note: null, decision: 'granted' },
    ]

    const html = renderToStaticMarkup(await RequestsPage(nothing))

    expect(html).toContain('github.com/alice/shared')
    expect(html).toContain('app.requests.pending')
    expect(html).toContain('github.com/alice/old')
    expect(html).toContain('app.requests.granted')
  })
})
