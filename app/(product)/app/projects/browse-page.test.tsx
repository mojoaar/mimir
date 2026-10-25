import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const notFound = vi.hoisted(() => vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
}))

vi.mock('next/navigation', () => ({ notFound }))
vi.mock('@/lib/auth/context', () => ({
  requireUser: async () => ({ id: 'u1', email: 'a@b.test', locale: state.locale }),
  getCurrentUser: async () => ({ id: 'u1', email: 'a@b.test', locale: state.locale }),
}))
const state = vi.hoisted(() => ({
  locale: 'en',
  project: { id: 'p1', slug: 'demo', name: 'Demo', role: 'owner' } as { id: string; slug: string; name: string; role: string } | null,
}))

vi.mock('@/lib/projects/service', () => ({
  getProject: async () => state.project,
  listProjects: async () => [],
}))
vi.mock('@/lib/memory/service', () => ({
  treeMemory: async () => [
    { path: 'auth/cookies', title: 'Cookie settings', hasSummary: true, updatedAt: new Date(0) },
    { path: 'auth/rotation', title: 'Rotate tokens', hasSummary: false, updatedAt: new Date(0) },
  ],
  readMemory: async (_userId: string, _projectId: string, path: string) =>
    path === 'auth/rotation'
      ? {
          id: 'm1',
          path: 'auth/rotation',
          title: 'Rotate tokens',
          summary: null,
          body: 'Rotate every 30 days.',
          kind: 'note',
          updatedAt: new Date(0),
        }
      : null,
  listDeletedMemories: async () => [],
  readMissing: null,
}))
vi.mock('@/lib/memory/search', () => ({ searchMemories: async () => [] }))
vi.mock('@/lib/memory/versions', () => ({
  listVersions: async () => [
    {
      id: '9',
      path: 'auth/rotation',
      title: 'Rotate tokens',
      kind: 'note',
      source: 'agent',
      updatedAt: new Date(0),
      createdAt: new Date(0),
      bytes: 20,
    },
  ],
  // A version from a different memory in the same project: the page must not
  // diff it against the memory that is open.
  getVersion: async () => ({
    id: '9',
    path: 'other/path',
    title: 'Foreign',
    summary: null,
    body: 'FOREIGN BODY',
    kind: 'note',
    source: 'agent',
    updatedAt: new Date(0),
    createdAt: new Date(0),
  }),
}))

import ProjectBrowser from './[slug]/page'

function page(search: Record<string, string>) {
  return ProjectBrowser({ params: Promise.resolve({ slug: 'demo' }), searchParams: Promise.resolve(search) })
}

describe('project browser', () => {
  it('shows the tree, the title and the body of the selected memory', async () => {
    const html = renderToStaticMarkup(await page({ path: 'auth/rotation' }))
    expect(html).toContain('auth / rotation')
    expect(html).toContain('Rotate tokens')
    expect(html).toContain('Rotate every 30 days.')
    expect(html).toContain('?path=auth%2Fcookies')
    expect(html).toContain('History (1)')
  })

  it('names the search box and the editor for a screen reader', async () => {
    const html = renderToStaticMarkup(await page({ path: 'auth/rotation' }))
    expect(html).toContain('for="memory-search"')
    expect(html).toContain('for="memory-body"')
    expect(html).toContain('Search this project')
    expect(html).toContain('Memory body')
  })

  it('asks the reader to choose something before a path is picked', async () => {
    const html = renderToStaticMarkup(await page({}))
    expect(html).toContain('Choose a memory')
  })

  it('says there is nothing at a path that is not stored', async () => {
    const html = renderToStaticMarkup(await page({ path: 'a/b' }))
    expect(html).toContain('There is nothing here')
    expect(html).toContain('Back to your projects')
  })

  it('says there is nothing when the project is missing', async () => {
    const saved = state.project
    state.project = null
    try {
      const html = renderToStaticMarkup(await page({}))
      expect(html).toContain('There is nothing here')
    } finally {
      state.project = saved
    }
  })

  it('survives a repeated query parameter instead of crashing on it', async () => {
    const html = renderToStaticMarkup(await page({ q: ['one', 'two'] as never }))
    expect(html).toContain('Search this project')
  })

  it('ignores a version that belongs to another memory', async () => {
    const html = renderToStaticMarkup(
      await page({ path: 'auth/rotation', history: '1', version: '9' }),
    )

    expect(html).not.toContain('FOREIGN BODY')
  })

  it('speaks the language saved on the account', async () => {
    state.locale = 'da'
    const html = renderToStaticMarkup(
      await ProjectBrowser({
        params: Promise.resolve({ slug: 'demo' }),
        searchParams: Promise.resolve({ path: 'auth/rotation' }),
      }),
    )
    state.locale = 'en'

    expect(html).toContain('← Projekter')
    expect(html).toContain('Ingen resumé endnu.')
    expect(html).toContain('Historik (1)')
    expect(html).toContain('Kan gendannes i 30 dage.')
  })
})
