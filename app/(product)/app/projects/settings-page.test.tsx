import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  getProjectHealth: vi.fn(async () => ({ memories: 3, summarised: 1, embedded: 2 })),
  getEmbeddingConfig: vi.fn(async () => ({ provider: 'test' }) as unknown),
  listProviders: vi.fn(async () => []),
  listGrants: vi.fn(async () => [] as unknown[]),
  listTeams: vi.fn(async () => [] as unknown[]),
  listFolders: vi.fn(async () => [] as { id: string; path: string }[]),
  claimFolder: vi.fn(async () => {}),
  releaseFolder: vi.fn(async () => ({})),
  grantProject: vi.fn(async () => {}),
  revokeGrant: vi.fn(async () => {}),
  findUserId: vi.fn(async () => 'u2' as string | null),
  locale: 'en',
}))

vi.mock('@/lib/auth/context', () => ({
  requireUser: async () => ({ id: 'u1', email: 'alice@example.test', locale: mocks.locale }),
  getCurrentUser: async () => ({ id: 'u1', email: 'alice@example.test', locale: mocks.locale }),
}))
vi.mock('@/lib/projects/service', () => ({
  getProject: mocks.getProject,
  getProjectHealth: mocks.getProjectHealth,
}))
vi.mock('@/lib/settings/embedding', () => ({ getEmbeddingConfig: mocks.getEmbeddingConfig }))
vi.mock('@/lib/providers/service', () => ({ listProviders: mocks.listProviders }))
vi.mock('@/lib/projects/access', () => ({
  listGrants: mocks.listGrants,
  grantProject: mocks.grantProject,
  revokeGrant: mocks.revokeGrant,
}))
vi.mock('@/lib/teams/service', () => ({ listTeams: mocks.listTeams }))
vi.mock('@/lib/projects/folders', () => ({
  listFolders: mocks.listFolders,
  claimFolder: mocks.claimFolder,
  releaseFolder: mocks.releaseFolder,
}))
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
import {
  claimFolderAction,
  grantProjectAction,
  releaseFolderAction,
  revokeProjectGrantAction,
} from './[slug]/settings/actions'

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

  it('says how much of the memory is learned, not just how much exists', async () => {
    mocks.getProject.mockResolvedValueOnce(project)

    const html = await render()

    expect(html).toContain('3 memories · 1 summarised · 2 embedded')
  })

  it('offers the owner the two repairs that make the counts go up', async () => {
    mocks.getProject.mockResolvedValueOnce({ ...project, learningEnabled: true })

    const html = await render()

    expect(html).toContain('Summarise now')
    expect(html).toContain('Embed missing')
  })

  it('does not offer to summarise while learning is off', async () => {
    mocks.getProject.mockResolvedValueOnce(project)

    const html = await render()

    expect(html).not.toContain('Summarise now')
  })

  it('explains the missing button when the install has no embeddings', async () => {
    mocks.getProject.mockResolvedValueOnce(project)
    mocks.getEmbeddingConfig.mockResolvedValueOnce(null)

    const html = await render()

    expect(html).toContain('Embeddings are not configured')
    expect(html).not.toContain('Embed missing')
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

  it('lists the folders a project answers for, for its owner', async () => {
    mocks.getProject.mockResolvedValueOnce(project)
    mocks.listFolders.mockResolvedValueOnce([{ id: 'f1', path: '/Users/alice/AI' }])

    const html = await render()

    expect(html).toContain('Folders')
    expect(html).toContain('/Users/alice/AI')
    expect(html).toContain('name="folder"')
  })

  it('keeps the folders section to the owner, because a claim is their own', async () => {
    mocks.getProject.mockResolvedValueOnce({ ...project, role: 'write' })
    mocks.listFolders.mockResolvedValueOnce([{ id: 'f1', path: '/Users/alice/AI' }])

    const html = await render()

    expect(html).not.toContain('/Users/alice/AI')
    expect(html).not.toContain('Add folder')
  })
})

describe('folder actions', () => {
  it('claims the folder the owner typed', async () => {
    const form = new FormData()
    form.set('projectId', 'p1')
    form.set('slug', 'mimir')
    form.set('folder', '/Users/alice/AI')

    await expect(claimFolderAction(form)).rejects.toThrow(
      'NEXT_REDIRECT:/app/projects/mimir/settings?notice=Folder%20claimed.',
    )
    expect(mocks.claimFolder).toHaveBeenCalledWith('u1', 'p1', '/Users/alice/AI')
  })

  it('releases the folder the owner removed', async () => {
    const form = new FormData()
    form.set('folderId', 'f1')
    form.set('slug', 'mimir')

    await expect(releaseFolderAction(form)).rejects.toThrow(
      'NEXT_REDIRECT:/app/projects/mimir/settings?notice=Folder%20released.',
    )
    expect(mocks.releaseFolder).toHaveBeenCalledWith('u1', 'f1')
  })

  it('says why a folder could not be claimed', async () => {
    mocks.claimFolder.mockRejectedValueOnce(
      Object.assign(new Error('that folder is already claimed by another project'), {
        code: 'invalid_params',
      }),
    )
    const form = new FormData()
    form.set('projectId', 'p1')
    form.set('slug', 'mimir')
    form.set('folder', '/Users/alice/AI')

    await expect(claimFolderAction(form)).rejects.toThrow('NEXT_REDIRECT:/app/projects/mimir/settings?error=')
  })
})

describe('the language of the page', () => {
  it('speaks Danish on the project settings screen', async () => {
    mocks.locale = 'da'

    try {
      mocks.getProject.mockResolvedValueOnce(project)
      const html = await render()

      expect(html).toContain('Farezone')
      expect(html).toContain('Deling')
      expect(html).toContain('← Projekter')
    } finally {
      mocks.locale = 'en'
    }
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
