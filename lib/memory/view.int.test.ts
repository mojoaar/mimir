import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { closePools } from '@/lib/db/pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import { deleteMemory, listDeletedMemories, readMemory, treeMemory, writeMemory } from './service'
import { listVersions } from './versions'
import { readProjectView } from './view'

let f: Fixtures

beforeEach(async () => {
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
})

afterAll(async () => {
  await closePools()
})

describe('readProjectView', () => {
  it('refuses a stranger before reading anything', async () => {
    await writeMemory({
      userId: f.alice,
      projectId: f.aliceProjectId,
      path: 'a/secret',
      body: 'not for bob',
    })

    await expect(
      readProjectView({ userId: f.bob, projectId: f.aliceProjectId, sort: 'path', depth: 12 }),
    ).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('returns what the individual helpers return', async () => {
    await writeMemory({ userId: f.alice, projectId: f.aliceProjectId, path: 'a/one', body: 'first' })
    await writeMemory({ userId: f.alice, projectId: f.aliceProjectId, path: 'b/two', body: 'second' })
    await writeMemory({ userId: f.alice, projectId: f.aliceProjectId, path: 'b/two', body: 'second, fixed' })
    await deleteMemory(f.alice, f.aliceProjectId, 'a/one')

    const memory = await readMemory(f.alice, f.aliceProjectId, 'b/two')
    const view = await readProjectView({
      userId: f.alice,
      projectId: f.aliceProjectId,
      path: 'b/two',
      sort: 'path',
      depth: 12,
    })

    expect(view.memory).toEqual(memory)
    expect(view.entries).toEqual(await treeMemory(f.alice, f.aliceProjectId, '', 12, 'path'))
    expect(view.deleted).toEqual(await listDeletedMemories(f.alice, f.aliceProjectId))
    expect(view.versions).toEqual(
      await listVersions(f.alice, f.aliceProjectId, 'b/two'),
    )
  })

  it('answers an unknown version with nothing instead of failing', async () => {
    await writeMemory({ userId: f.alice, projectId: f.aliceProjectId, path: 'a/one', body: 'first' })

    const view = await readProjectView({
      userId: f.alice,
      projectId: f.aliceProjectId,
      sort: 'path',
      depth: 12,
      versionId: '999999',
    })

    expect(view.version).toBeNull()
    expect(view.versions).toEqual([])
  })
})
