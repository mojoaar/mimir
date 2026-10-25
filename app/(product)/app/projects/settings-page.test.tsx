import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  listProviders: vi.fn(async () => []),
}))

vi.mock('@/lib/auth/context', () => ({ requireUser: async () => ({ id: 'u1' }) }))
vi.mock('@/lib/projects/service', () => ({ getProject: mocks.getProject }))
vi.mock('@/lib/providers/service', () => ({ listProviders: mocks.listProviders }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

import ProjectSettingsPage from './[slug]/settings/page'

const project = {
  id: 'p1',
  slug: 'mimir',
  name: 'mimir',
  learningEnabled: false,
  llmProviderId: null,
  role: 'owner' as const,
}

async function render() {
  return renderToStaticMarkup(
    await ProjectSettingsPage({
      params: Promise.resolve({ slug: 'mimir' }),
      searchParams: Promise.resolve({}),
    }),
  )
}

describe('project settings page', () => {
  it('offers the owner an archive control that says what it does', async () => {
    mocks.getProject.mockResolvedValueOnce(project)

    const html = await render()

    expect(html).toContain('Danger zone')
    expect(html).toContain('Archive project')
    expect(html).toContain('Memories and grants are kept')
  })

  it('hides the danger zone from a user who does not own the project', async () => {
    mocks.getProject.mockResolvedValueOnce({ ...project, role: 'write' })

    expect(await render()).not.toContain('Danger zone')
  })

  it('shows why an archive was refused', async () => {
    mocks.getProject.mockResolvedValueOnce(project)

    const html = renderToStaticMarkup(
      await ProjectSettingsPage({
        params: Promise.resolve({ slug: 'mimir' }),
        searchParams: Promise.resolve({ error: 'Only the project owner can change that.' }),
      }),
    )

    expect(html).toContain('Only the project owner can change that.')
  })
})
