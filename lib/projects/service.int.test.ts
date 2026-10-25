import { beforeEach, describe, expect, it } from 'vitest'

import { adminPool } from '@/lib/db/pool'
import { resetFixtures, seedGrant, seedTwoUsersWithProjects } from '@/lib/db/seed'

import { resolveProject } from './service'

let alice: string
let bob: string

beforeEach(async () => {
  await resetFixtures()
  ;({ alice, bob } = await seedTwoUsersWithProjects())
})

describe('resolveProject', () => {
  it('finds a project by repo key before creating a duplicate', async () => {
    const first = await resolveProject(alice, { repo: 'github.com/mojoaar/mimir' })
    const again = await resolveProject(alice, { repo: 'github.com/mojoaar/mimir' })

    expect(again.id).toBe(first.id)
  })

  it('finds a shared project rather than creating a private one', async () => {
    const p = await resolveProject(alice, { repo: 'github.com/mojoaar/mimir' })
    await seedGrant(p.id, bob, 'read')

    expect((await resolveProject(bob, { repo: 'github.com/mojoaar/mimir' })).id).toBe(p.id)
  })

  it('creates a project owned by the caller', async () => {
    const p = await resolveProject(bob, { repo: 'github.com/other/thing' })
    const { rows } = await adminPool.query<{ owner_user_id: string }>(
      'select owner_user_id from projects where id = $1',
      [p.id],
    )

    expect(rows[0]?.owner_user_id).toBe(bob)
  })
})
