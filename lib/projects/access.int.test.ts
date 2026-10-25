import { beforeEach, describe, expect, it } from 'vitest'
import { grantProject, listGrants, projectRole, requireProjectRole, revokeGrant } from './access'
import { resetFixtures, seedGrant, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'

let f: Fixtures

beforeEach(async () => {
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
})

describe('project access', () => {
  it('lets a read grant read but not write', async () => {
    await seedGrant(f.aliceProjectId, f.bob, 'read')

    expect(await projectRole(f.bob, f.aliceProjectId)).toBe('read')
    expect(await requireProjectRole(f.bob, f.aliceProjectId, 'read')).toBe('read')
    await expect(requireProjectRole(f.bob, f.aliceProjectId, 'write')).rejects.toMatchObject({
      code: 'forbidden',
    })
  })

  it('lets a write grant write but not manage grants', async () => {
    await grantProject(f.alice, f.aliceProjectId, f.bob, 'write')

    expect(await projectRole(f.bob, f.aliceProjectId)).toBe('write')
    // bob holds write, but only the owner may hand out grants
    await expect(grantProject(f.bob, f.aliceProjectId, f.carol, 'read')).rejects.toMatchObject({
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
    await grantProject(f.alice, f.aliceProjectId, f.bob, 'read')
    await grantProject(f.alice, f.aliceProjectId, f.carol, 'write')

    const grants = await listGrants(f.alice, f.aliceProjectId)
    expect(grants).toHaveLength(2)
    expect(grants.map((g) => g.role).sort()).toEqual(['read', 'write'])

    await revokeGrant(f.alice, f.aliceProjectId, f.bob)
    expect(await projectRole(f.bob, f.aliceProjectId)).toBeNull()
  })
})
