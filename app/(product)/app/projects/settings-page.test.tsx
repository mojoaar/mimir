import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  listProviders: vi.fn(async () => []),
  listGrants: vi.fn(async () => [] as unknown[]),
  listTeams: vi.fn(async () => [] as unknown[]),
  grantProject: vi.fn(async () => {}),
  revokeGrant: vi.fn(async () => {}),
  findUserId: vi.fn(async () => 'u2' as string | null),
}))

vi.mock('@/lib/auth/context', () => ({ requireUser: async () => ({ id: 'u1' }) }))
vi.mock('@/lib/projects/service', () => ({ getProject: mocks.getProject }))
vi.mock('@/lib/providers/service', () => ({ listProviders: mocks.listProviders }))
vi.mock('@/lib/projects/access', () => ({
  listGrants: mocks.listGrants,
  grantProject: mocks.grantProject,
  revokeGrant: mocks.revokeGrant,
}))
vi.mock('@/lib/teams/service', () => ({ listTeams: mocks.listTeams }))
vi.mock('@/lib/users/lookup', () => ({ findActiveUserIdByEmail: mocks.findUserId }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/audit', () => ({ audit: async () => {} }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
}))

import ProjectSettingsPage from './[slug]/settings/page'
import { grantProjectAction, revokeProjectGrantAction } from './[slug]/settings/actions'

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

  it('names a team grant as a team, so nobody mistakes it for a person', async () => {
    mocks.getProject.mockResolvedValueOnce(project)
    mocks.listGrants.mockResolvedValueOnce([
      { principalType: 'team', principalId: 't1', label: 'reviewers', role: 'read' },
    ])

    const html = await render()

    expect(html).toContain('reviewers')
    expect(html).toContain('team')
    expect(html).toContain('Revoke')
  })

  it('hides the sharing controls from anyone who does not own the project', async () => {
    mocks.getProject.mockResolvedValueOnce({ ...project, role: 'read' })
    mocks.listGrants.mockResolvedValueOnce([
      { principalType: 'user', principalId: 'u2', label: 'bob@example.test', role: 'write' },
    ])

    const html = await render()

    expect(html).not.toContain('Share this project')
    expect(html).not.toContain('Revoke')
  })
})

describe('grant actions', () => {
  it('shares with the chosen team, not with a person', async () => {
    const form = new FormData()
    form.set('projectId', 'p1')
    form.set('slug', 'mimir')
    form.set('principalType', 'team')
    form.set('teamId', 't1')
    form.set('role', 'read')

    await grantProjectAction({}, form)

    expect(mocks.grantProject).toHaveBeenCalledWith('u1', 'p1', 'team', 't1', 'read')
  })

  it('resolves an email to a person before granting', async () => {
    const form = new FormData()
    form.set('projectId', 'p1')
    form.set('slug', 'mimir')
    form.set('principalType', 'user')
    form.set('email', 'bob@example.test')
    form.set('role', 'write')

    await grantProjectAction({}, form)

    expect(mocks.findUserId).toHaveBeenCalledWith('bob@example.test')
    expect(mocks.grantProject).toHaveBeenCalledWith('u1', 'p1', 'user', 'u2', 'write')
  })

  it('says so when the address belongs to nobody active', async () => {
    mocks.findUserId.mockResolvedValueOnce(null)
    const form = new FormData()
    form.set('projectId', 'p1')
    form.set('slug', 'mimir')
    form.set('principalType', 'user')
    form.set('email', 'nobody@example.test')
    form.set('role', 'read')

    const state = await grantProjectAction({}, form)

    expect(state.error).toContain('nobody@example.test')
    expect(mocks.grantProject).not.toHaveBeenCalled()
  })

  it('revokes a grant and audits it', async () => {
    const form = new FormData()
    form.set('projectId', 'p1')
    form.set('slug', 'mimir')
    form.set('principalType', 'team')
    form.set('principalId', 't1')

    await revokeProjectGrantAction(form)

    expect(mocks.revokeGrant).toHaveBeenCalledWith('u1', 'p1', 'team', 't1')
  })
})
