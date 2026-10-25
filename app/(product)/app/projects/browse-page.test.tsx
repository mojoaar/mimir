import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const notFound = vi.hoisted(() => vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
}))

vi.mock('next/navigation', () => ({ notFound }))
vi.mock('@/lib/auth/context', () => ({ requireUser: async () => ({ id: 'u1', email: 'a@b.test' }) }))
vi.mock('@/lib/projects/service', () => ({
  getProject: async () => ({ id: 'p1', slug: 'demo', name: 'Demo', role: 'owner' }),
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

  it('asks the reader to choose something before a path is picked', async () => {
    const html = renderToStaticMarkup(await page({}))
    expect(html).toContain('Choose a memory')
  })

  it('404s a path that is not stored', async () => {
    await expect(page({ path: 'a/b' })).rejects.toThrow('NEXT_NOT_FOUND')
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
})
