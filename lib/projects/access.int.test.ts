import { beforeEach, describe, expect, it } from 'vitest'
import { grantProject, listGrants, projectRole, requireProjectRole, revokeGrant } from './access'
import { resetFixtures, seedGrant, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import { adminPool } from '@/lib/db/pool'

let f: Fixtures

beforeEach(async () => {
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
})

/** A team owned by `owner`, with `members` (the owner is always a member). */
async function makeTeam(owner: string, name: string, members: string[] = []): Promise<string> {
  const { rows } = await adminPool().query<{ id: string }>(
    'insert into teams (owner_user_id, name, slug) values ($1, $2, $3) returning id',
    [owner, name, name],
  )
  const id = rows[0]!.id
  for (const userId of [owner, ...members]) {
    await adminPool().query(
      `insert into team_members (team_id, user_id, role) values ($1, $2, $3)`,
      [id, userId, userId === owner ? 'owner' : 'member'],
    )
  }
  return id
}

describe('project access', () => {
  it('lets a read grant read but not write', async () => {
    await seedGrant(f.aliceProjectId, f.bob, 'read')

    expect(await projectRole(f.bob, f.aliceProjectId)).toBe('read')
    expect(await requireProjectRole(f.bob, f.aliceProjectId, 'read')).toBe('read')
    await expect(requireProjectRole(f.bob, f.aliceProjectId, 'write')).rejects.toMatchObject({
      code: 'forbidden',
    })
  })

  it('does not let a read grantee enumerate the other grantees', async () => {
    await grantProject(f.alice, f.aliceProjectId, 'user', f.bob, 'read')
    await expect(listGrants(f.bob, f.aliceProjectId)).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('does not let a write grantee enumerate the other grantees either', async () => {
    await grantProject(f.alice, f.aliceProjectId, 'user', f.bob, 'write')
    await expect(listGrants(f.bob, f.aliceProjectId)).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('lets a write grant write but not manage grants', async () => {
    await grantProject(f.alice, f.aliceProjectId, 'user', f.bob, 'write')

    expect(await projectRole(f.bob, f.aliceProjectId)).toBe('write')
    // bob holds write, but only the owner may hand out grants
    await expect(grantProject(f.bob, f.aliceProjectId, 'user', f.carol, 'read')).rejects.toMatchObject({
      code: 'forbidden',
    })
  })

  it('does not let an admin read a project without a grant', async () => {
    expect(await projectRole(f.admin, f.aliceProjectId)).toBeNull()
  })

  it('returns null for a project the user cannot see, without revealing it exists', async () => {
    expect(await projectRole(f.carol, '00000000-0000-0000-0000-000000000000')).toBeNull()
  })

  it('lists grants with emails and drops one on revoke', async () => {
    await grantProject(f.alice, f.aliceProjectId, 'user', f.bob, 'read')
    await grantProject(f.alice, f.aliceProjectId, 'user', f.carol, 'write')

    const grants = await listGrants(f.alice, f.aliceProjectId)
    expect(grants).toHaveLength(2)
    expect(grants.map((g) => g.role).sort()).toEqual(['read', 'write'])

    await revokeGrant(f.alice, f.aliceProjectId, 'user', f.bob)
    expect(await projectRole(f.bob, f.aliceProjectId)).toBeNull()
  })
})

describe('team grants', () => {
  it('gives every member the role the team was granted', async () => {
    const team = await makeTeam(f.alice, 'reviewers', [f.bob])
    await grantProject(f.alice, f.aliceProjectId, 'team', team, 'write')

    expect(await projectRole(f.bob, f.aliceProjectId)).toBe('write')
    expect(await projectRole(f.carol, f.aliceProjectId)).toBeNull()
  })

  it('takes the best role when a user is in two teams', async () => {
    const readers = await makeTeam(f.alice, 'readers', [f.bob])
    const writers = await makeTeam(f.alice, 'writers', [f.bob])
    await grantProject(f.alice, f.aliceProjectId, 'team', readers, 'read')
    await grantProject(f.alice, f.aliceProjectId, 'team', writers, 'write')

    expect(await projectRole(f.bob, f.aliceProjectId)).toBe('write')
  })

  it('never makes a team member the owner', async () => {
    const team = await makeTeam(f.alice, 'staff', [f.bob])
    await grantProject(f.alice, f.aliceProjectId, 'team', team, 'write')

    expect(await projectRole(f.bob, f.aliceProjectId)).toBe('write')
    await expect(requireProjectRole(f.bob, f.aliceProjectId, 'owner')).rejects.toMatchObject({
      code: 'forbidden',
    })
  })

  it('refuses a team the actor does not belong to', async () => {
    const theirs = await makeTeam(f.bob, 'bobs-team')
    await expect(
      grantProject(f.alice, f.aliceProjectId, 'team', theirs, 'read'),
    ).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('reports a missing team as not found', async () => {
    await expect(
      grantProject(f.alice, f.aliceProjectId, 'team', '00000000-0000-0000-0000-000000000000', 'read'),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('lists a team grant by name and drops access on revoke', async () => {
    const team = await makeTeam(f.alice, 'reviewers', [f.bob])
    await grantProject(f.alice, f.aliceProjectId, 'team', team, 'read')

    const grants = await listGrants(f.alice, f.aliceProjectId)
    expect(grants).toEqual([{ principalType: 'team', principalId: team, label: 'reviewers', role: 'read' }])

    await revokeGrant(f.alice, f.aliceProjectId, 'team', team)
    expect(await projectRole(f.bob, f.aliceProjectId)).toBeNull()
  })
})
