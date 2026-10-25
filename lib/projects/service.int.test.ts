import { beforeEach, describe, expect, it } from 'vitest'

import { adminPool } from '@/lib/db/pool'
import { resetFixtures, seedGrant, seedTwoUsersWithProjects } from '@/lib/db/seed'

import { readMemory, writeMemory } from '@/lib/memory/service'

import {
  archiveProject,
  getProject,
  listProjects,
  resolveProject,
  restoreProject,
  updateProjectSettings,
} from './service'

let alice: string
let bob: string
let aliceProjectId: string

beforeEach(async () => {
  await resetFixtures()
  ;({ alice, bob, aliceProjectId } = await seedTwoUsersWithProjects())
})

describe('resolveProject', () => {
  it('finds a project by repo key before creating a duplicate', async () => {
    const first = await resolveProject(alice, { repo: 'github.com/mojoaar/mimir', create: true })
    const again = await resolveProject(alice, { repo: 'github.com/mojoaar/mimir', create: true })

    expect(again.id).toBe(first.id)
  })

  it('finds a shared project rather than creating a private one', async () => {
    const p = await resolveProject(alice, { repo: 'github.com/mojoaar/mimir', create: true })
    await seedGrant(p.id, bob, 'read')

    expect((await resolveProject(bob, { repo: 'github.com/mojoaar/mimir', create: true })).id).toBe(p.id)
  })

  it('creates a project owned by the caller', async () => {
    const p = await resolveProject(bob, { repo: 'github.com/other/thing', create: true })
    const { rows } = await adminPool().query<{ owner_user_id: string }>(
      'select owner_user_id from projects where id = $1',
      [p.id],
    )

    expect(rows[0]?.owner_user_id).toBe(bob)
  })
})

describe('project settings', () => {
  it('a write grantee cannot redirect the owner’s provider', async () => {
    await seedGrant(aliceProjectId, bob, 'write')

    await expect(
      updateProjectSettings(bob, aliceProjectId, { llmProviderId: null }),
    ).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('the owner can toggle learning', async () => {
    await updateProjectSettings(alice, aliceProjectId, { learningEnabled: true })

    expect((await getProject(alice, 'alice-project'))?.learningEnabled).toBe(true)
  })

  it('a write grantee cannot toggle learning, and is told so', async () => {
    await seedGrant(aliceProjectId, bob, 'write')

    await expect(
      updateProjectSettings(bob, aliceProjectId, { learningEnabled: true }),
    ).rejects.toMatchObject({ code: 'forbidden' })

    expect((await getProject(alice, 'alice-project'))?.learningEnabled).toBe(false)
  })
})

describe('archiving', () => {
  it('hides an archived project from the list unless asked for it', async () => {
    await archiveProject(alice, aliceProjectId)

    expect(await listProjects(alice)).toEqual([])
    const withArchived = await listProjects(alice, true)
    expect(withArchived).toHaveLength(1)
    expect(withArchived[0]).toMatchObject({ slug: 'alice-project', archived: true })
  })

  it('makes an archived project unreachable while keeping its memories', async () => {
    await writeMemory({ userId: alice, projectId: aliceProjectId, path: 'deploy/compose', body: 'keep me' })
    await archiveProject(alice, aliceProjectId)

    expect(await getProject(alice, 'alice-project')).toBeNull()
    const { rows } = await adminPool().query<{ count: number }>(
      'select count(*)::int as count from memories where project_id = $1',
      [aliceProjectId],
    )
    expect(rows[0]?.count).toBe(1)
  })

  it('restores an archived project with its memories intact', async () => {
    await writeMemory({ userId: alice, projectId: aliceProjectId, path: 'deploy/compose', body: 'keep me' })
    await archiveProject(alice, aliceProjectId)
    await restoreProject(alice, aliceProjectId)

    expect((await getProject(alice, 'alice-project'))?.slug).toBe('alice-project')
    expect((await listProjects(alice))[0]).toMatchObject({ archived: false })
    const { rows } = await adminPool().query<{ count: number }>(
      'select count(*)::int as count from memories where project_id = $1 and deleted_at is null',
      [aliceProjectId],
    )
    expect(rows[0]?.count).toBe(1)
  })

  it('refuses agent writes to an archived project instead of failing inside a dead transaction', async () => {
    const p = await resolveProject(alice, { repo: 'github.com/alice/archived-repo', create: true })
    await writeMemory({ userId: alice, projectId: p.id, path: 'a/b', body: 'kept' })
    await archiveProject(alice, p.id)

    // What the plugin actually does: resolve by repo, then write.
    const again = await resolveProject(alice, { repo: 'github.com/alice/archived-repo', create: true })

    expect(again.id).toBe(p.id)
    await expect(
      writeMemory({ userId: alice, projectId: again.id, path: 'a/b', body: 'new' }),
    ).rejects.toMatchObject({ code: 'forbidden' })
    await expect(readMemory(alice, again.id, 'a/b')).rejects.toMatchObject({ code: 'forbidden' })

    await restoreProject(alice, p.id)
    expect((await readMemory(alice, again.id, 'a/b'))?.body).toBe('kept')
  })

  it('a read grantee cannot archive', async () => {
    await seedGrant(aliceProjectId, bob, 'read')

    await expect(archiveProject(bob, aliceProjectId)).rejects.toMatchObject({ code: 'forbidden' })
    expect(await getProject(alice, 'alice-project')).not.toBeNull()
  })
})

describe('a project named by the caller', () => {
  it('creates it on the first call and reuses it afterwards', async () => {
    const first = await resolveProject(alice, { project: 'Reading Notes', create: true })

    expect(first).toMatchObject({ slug: 'reading-notes', role: 'owner' })
    expect((await getProject(alice, 'reading-notes'))?.name).toBe('Reading Notes')

    const again = await resolveProject(alice, { project: 'Reading Notes', create: true })
    expect(again.id).toBe(first.id)
  })

  it('still refuses to invent one when the caller asked for lookup only', async () => {
    await expect(resolveProject(alice, { project: 'notes', create: false })).rejects.toMatchObject({
      code: 'project_not_found',
    })
  })

  it('gives two users their own project with the same name', async () => {
    const one = await resolveProject(alice, { project: 'notes', create: true })
    const two = await resolveProject(bob, { project: 'notes', create: true })

    expect(two.id).not.toBe(one.id)
    // slug uniqueness is per owner, so two people may both have "notes"
    expect(two.slug).toBe('notes')
  })

  it('falls back to a usable slug when the name has none', async () => {
    const created = await resolveProject(alice, { project: '***', create: true })

    expect(created.slug).toBe('project')
  })
})
