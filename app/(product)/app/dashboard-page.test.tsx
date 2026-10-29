import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  projects: [] as Array<Record<string, unknown>>,
  hits: [] as Array<Record<string, unknown>>,
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))

vi.mock('@/lib/auth/context', () => ({
  requireUser: async () => ({
    id: 'u1',
    email: 'alice@example.test',
    role: 'user',
    name: 'Alice',
    status: 'active',
    mfaEnabled: false,
    locale: 'en',
  }),
}))
vi.mock('@/lib/projects/service', () => ({ listProjects: async () => state.projects }))
vi.mock('@/lib/memory/search', () => ({ searchMemories: async () => state.hits }))
vi.mock('@/lib/i18n/request', () => ({ translator: async () => (key: string) => key }))
vi.mock('./projects/actions', () => ({ restoreProjectAction: async () => {} }))
vi.mock('@/lib/settings/time', () => ({ getTimeFormat: async () => ({ timeZone: 'UTC', clock: '24h' }) }))

import DashboardPage from './page'

const nothing = { searchParams: Promise.resolve({}) }
const searching = (query: string) => ({ searchParams: Promise.resolve({ query }) })

beforeEach(() => {
  state.projects = [
    {
      id: 'p1',
      slug: 'alice-project',
      name: 'Alice Project',
      role: 'owner',
      memoryCount: 4,
      archived: false,
    },
  ]
  state.hits = []
})

describe('the project list', () => {
  it('offers one search box for every project', async () => {
    const html = renderToStaticMarkup(await DashboardPage(nothing))

    expect(html).toContain('name="query"')
    expect(html).toContain('app.dashboard.searchPlaceholder')
    expect(html).toContain('Alice Project')
  })
})

describe('searching across projects', () => {
  it('groups a hit under the project it came from', async () => {
    state.hits = [
      {
        path: 'deploy/rollback',
        title: 'Roll back by redeploying the previous image',
        summary: null,
        excerpt: 'roll back by redeploying the previous image',
        projectSlug: 'alice-project',
        projectName: 'Alice Project',
        score: 0.03,
      },
    ]

    const html = renderToStaticMarkup(await DashboardPage(searching('redeploying')))

    expect(html).toContain('href="/app/projects/alice-project"')
    expect(html).toContain('deploy/rollback')
    expect(html).toContain('roll back by redeploying the previous image')
  })

  it('drops the excerpt when the summary already says it', async () => {
    state.hits = [
      {
        path: 'deploy/rollback',
        title: 'Roll back by redeploying',
        summary: 'Redeploying the previous image is the rollback.',
        excerpt: 'THE QUOTED BODY LINE',
        projectSlug: 'alice-project',
        projectName: 'Alice Project',
        score: 0.03,
      },
    ]

    const html = renderToStaticMarkup(await DashboardPage(searching('redeploying')))

    expect(html).toContain('Redeploying the previous image is the rollback.')
    expect(html).not.toContain('THE QUOTED BODY LINE')
  })

  it('says so when nothing matches', async () => {
    const html = renderToStaticMarkup(await DashboardPage(searching('nothing at all')))

    expect(html).toContain('app.browse.noMatches')
  })

  it('offers a refresh and says when the page was read', async () => {
    const html = renderToStaticMarkup(await DashboardPage(nothing))

    expect(html).toContain('app.refresh.label')
    expect(html).toContain('app.refresh.asOf')
  })
})
