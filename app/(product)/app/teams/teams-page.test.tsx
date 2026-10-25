import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  role: 'owner' as 'owner' | 'member',
  teams: [] as unknown[],
  detail: null as unknown,
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/lib/auth/context', () => ({
  requireUser: async () => ({ id: 'u1', email: 'alice@example.test' }),
}))
vi.mock('@/lib/teams/service', () => ({
  listTeams: async () => mocks.teams,
  createTeam: async () => ({}),
  getTeam: async () => mocks.detail,
  addTeamMember: async () => {},
  removeTeamMember: async () => {},
  deleteTeam: async () => {},
}))

import TeamsPage from './page'
import TeamDetailPage from './[id]/page'

function team(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    slug: 'platform',
    name: 'Platform',
    role: 'owner',
    memberCount: 4,
    ...overrides,
  }
}

describe('the teams page', () => {
  it('lists the teams a person belongs to, with their size', async () => {
    mocks.teams = [team(), team({ id: 't2', slug: 'readers', name: 'Readers', role: 'member', memberCount: 2 })]
    const html = renderToStaticMarkup(await TeamsPage({ searchParams: Promise.resolve({}) }))

    expect(html).toContain('Platform')
    expect(html).toContain('Readers')
    expect(html).toContain('4 members')
    expect(html).toContain('2 members')
    expect(html).toContain('Create team')
  })

  it('says so when there are no teams yet', async () => {
    mocks.teams = []
    expect(renderToStaticMarkup(await TeamsPage({ searchParams: Promise.resolve({}) }))).toContain('No teams yet')
  })
})

describe('a team page', () => {
  const params = Promise.resolve({ id: 't1' })

  it('shows the members and lets an owner delete the team', async () => {
    mocks.detail = {
      team: team({ role: mocks.role }),
      members: [
        { userId: 'u1', email: 'alice@example.test', name: 'Alice', role: 'owner' },
        { userId: 'u2', email: 'bob@example.test', name: 'Bob', role: 'member' },
      ],
    }
    const html = renderToStaticMarkup(await TeamDetailPage({ params, searchParams: Promise.resolve({}) }))

    expect(html).toContain('bob@example.test')
    expect(html).toContain('owner')
    expect(html).toContain('Add member')
    expect(html).toContain('Delete team')
  })

  it('hides the destructive controls from a plain member', async () => {
    mocks.detail = {
      team: team({ role: 'member' }),
      members: [{ userId: 'u2', email: 'bob@example.test', name: 'Bob', role: 'member' }],
    }
    const html = renderToStaticMarkup(await TeamDetailPage({ params, searchParams: Promise.resolve({}) }))

    expect(html).toContain('bob@example.test')
    expect(html).not.toContain('Delete team')
    expect(html).not.toContain('Remove')
  })

  it('lets a member leave, and only an owner rename', async () => {
    mocks.detail = {
      team: team({ role: 'member' }),
      members: [
        { userId: 'u1', email: 'alice@example.test', name: 'Alice', role: 'owner' },
        { userId: 'u2', email: 'bob@example.test', name: 'Bob', role: 'member' },
      ],
    }
    const asMember = renderToStaticMarkup(
      await TeamDetailPage({ params, searchParams: Promise.resolve({}) }),
    )

    expect(asMember).toContain('Leave team')
    expect(asMember).not.toContain('Rename')

    mocks.detail = {
      ...(mocks.detail as object),
      team: team({ role: 'owner' }),
      members: [
        { userId: 'u1', email: 'alice@example.test', name: 'Alice', role: 'owner' },
        { userId: 'u3', email: 'carol@example.test', name: 'Carol', role: 'owner' },
        { userId: 'u2', email: 'bob@example.test', name: 'Bob', role: 'member' },
      ],
    }
    const asOwner = renderToStaticMarkup(
      await TeamDetailPage({ params, searchParams: Promise.resolve({}) }),
    )

    expect(asOwner).toContain('Rename')
    expect(asOwner).toContain('Leave team')

    mocks.detail = {
      ...(mocks.detail as object),
      members: [{ userId: 'u1', email: 'alice@example.test', name: 'Alice', role: 'owner' }],
    }
    const lastOwner = renderToStaticMarkup(
      await TeamDetailPage({ params, searchParams: Promise.resolve({}) }),
    )

    expect(lastOwner).not.toContain('Leave team')
  })
})
