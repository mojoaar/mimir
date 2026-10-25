import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closePools } from '@/lib/db/pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import { deleteMemory, readMemory, writeMemory } from './service'
import { getVersion, listVersions, pruneVersions, restoreVersion, VERSION_LIMIT } from './versions'

let f: Fixtures
let projectId: string

beforeEach(async () => {
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
  projectId = f.aliceProjectId
})

afterAll(async () => {
  await closePools()
})

async function bodiesOf(project: string, path: string): Promise<string[]> {
  const versions = await listVersions(f.alice, project, path, 100)
  return Promise.all(versions.map(async (v) => (await getVersion(f.alice, project, v.id))!.body))
}

describe('memory versions', () => {
  it('keeps the body each write replaces, newest first', async () => {
    for (const body of ['first', 'second', 'third']) {
      await writeMemory({ userId: f.alice, projectId, path: 'auth/bodies', body })
    }

    const versions = await listVersions(f.alice, projectId, 'auth/bodies')

    expect(versions).toHaveLength(2)
    expect(await bodiesOf(projectId, 'auth/bodies')).toEqual(['second', 'first'])
    expect(versions[0]?.bytes).toBe('second'.length)
  })

  it('archives nothing on the first write', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'auth/fresh', body: 'only' })

    expect(await listVersions(f.alice, projectId, 'auth/fresh')).toEqual([])
  })

  it('makes no version when the body did not change', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'auth/same', body: 'unchanged' })
    await writeMemory({ userId: f.alice, projectId, path: 'auth/same', body: 'unchanged' })

    expect(await listVersions(f.alice, projectId, 'auth/same')).toEqual([])
  })

  it('does not archive the body of a soft-deleted memory it revives', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'auth/revived', body: 'before delete' })
    await deleteMemory(f.alice, projectId, 'auth/revived')

    await writeMemory({ userId: f.alice, projectId, path: 'auth/revived', body: 'after delete' })

    expect(await listVersions(f.alice, projectId, 'auth/revived')).toEqual([])
  })

  it('reads a version back in full and refuses a stranger', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'auth/full', body: 'original body' })
    await writeMemory({ userId: f.alice, projectId, path: 'auth/full', body: 'replacement' })
    const [version] = await listVersions(f.alice, projectId, 'auth/full')

    const full = await getVersion(f.alice, projectId, version!.id)

    expect(full?.body).toBe('original body')
    await expect(getVersion(f.bob, projectId, version!.id)).rejects.toMatchObject({
      code: 'forbidden',
    })
  })

  it('never loses a version when two writers race on one path', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'auth/race', body: 'v0' })

    await Promise.all([
      writeMemory({ userId: f.alice, projectId, path: 'auth/race', body: 'v1' }),
      writeMemory({ userId: f.alice, projectId, path: 'auth/race', body: 'v2' }),
    ])

    const bodies = await bodiesOf(projectId, 'auth/race')
    const live = (await readMemory(f.alice, projectId, 'auth/race'))!.body

    // Three distinct bodies across history and the live row: whichever order
    // they committed in, nothing was overwritten without being recorded.
    expect(new Set([...bodies, live]).size).toBe(3)
    expect(bodies).toContain('v0')
  })

  it('reports the size in bytes, not characters', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'auth/emoji', body: '🎉🎉🎉🎉🎉' })
    await writeMemory({ userId: f.alice, projectId, path: 'auth/emoji', body: 'plain' })

    const [version] = await listVersions(f.alice, projectId, 'auth/emoji')

    // Five astral characters are twenty UTF-8 bytes.
    expect(version?.bytes).toBe(20)
  })

  it('never loses a version when two writers create the same path at once', async () => {
    // No seeded first write: the row does not exist yet, so there is nothing to
    // lock and both writers race the insert.
    await Promise.all([
      writeMemory({ userId: f.alice, projectId, path: 'auth/fresh-race', body: 'body-a' }),
      writeMemory({ userId: f.alice, projectId, path: 'auth/fresh-race', body: 'body-b' }),
    ])

    const bodies = await bodiesOf(projectId, 'auth/fresh-race')
    const live = (await readMemory(f.alice, projectId, 'auth/fresh-race'))!.body

    // Both written bodies survive: one archived, one live.
    expect(new Set([...bodies, live]).size).toBe(2)
  })
})

describe('pruning', () => {
  it('keeps the newest versions per memory and never another memory’s rows', async () => {
    for (let i = 0; i < VERSION_LIMIT + 3; i += 1) {
      await writeMemory({ userId: f.alice, projectId, path: 'auth/many', body: `body ${i}` })
    }
    await writeMemory({ userId: f.alice, projectId, path: 'auth/other', body: 'one' })
    await writeMemory({ userId: f.alice, projectId, path: 'auth/other', body: 'two' })

    // The write path keeps the window itself, so the nightly job has nothing
    // left to do here; it remains the backstop for rows that predate it.
    expect(await pruneVersions()).toBe(0)
    expect(await listVersions(f.alice, projectId, 'auth/many', 100)).toHaveLength(VERSION_LIMIT)
    expect(await listVersions(f.alice, projectId, 'auth/other', 100)).toHaveLength(1)
  })
})

describe('restoring', () => {
  it('puts an old body back and keeps the body it replaced', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'auth/restore', body: 'v1' })
    await writeMemory({ userId: f.alice, projectId, path: 'auth/restore', body: 'v2' })
    const [newest] = await listVersions(f.alice, projectId, 'auth/restore')

    const result = await restoreVersion(f.alice, projectId, newest!.id)

    expect(result).toEqual({ restored: true, path: 'auth/restore' })
    expect((await readMemory(f.alice, projectId, 'auth/restore'))!.body).toBe('v1')
    // v2 became history, so a mistaken restore can itself be undone.
    expect(await bodiesOf(projectId, 'auth/restore')).toEqual(['v2', 'v1'])
  })

  it('refuses a version from a project the caller cannot see', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'auth/foreign', body: 'v1' })
    await writeMemory({ userId: f.alice, projectId, path: 'auth/foreign', body: 'v2' })
    const [version] = await listVersions(f.alice, projectId, 'auth/foreign')

    await expect(restoreVersion(f.bob, projectId, version!.id)).rejects.toMatchObject({
      code: 'forbidden',
    })
    expect((await readMemory(f.alice, projectId, 'auth/foreign'))!.body).toBe('v2')
  })

  it('refuses a read grantee', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'auth/grant', body: 'v1' })
    await writeMemory({ userId: f.alice, projectId, path: 'auth/grant', body: 'v2' })
    const [version] = await listVersions(f.alice, projectId, 'auth/grant')
    const { seedGrant } = await import('@/lib/db/seed')
    await seedGrant(projectId, f.bob, 'read')

    await expect(restoreVersion(f.bob, projectId, version!.id)).rejects.toMatchObject({
      code: 'forbidden',
    })
  })

  it('revives a deleted memory and keeps its history', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'auth/deleted', body: 'v1' })
    await writeMemory({ userId: f.alice, projectId, path: 'auth/deleted', body: 'v2' })
    const [version] = await listVersions(f.alice, projectId, 'auth/deleted')
    await deleteMemory(f.alice, projectId, 'auth/deleted')

    await restoreVersion(f.alice, projectId, version!.id)

    const live = await readMemory(f.alice, projectId, 'auth/deleted')
    expect(live?.body).toBe('v1')
    expect(await listVersions(f.alice, projectId, 'auth/deleted')).toHaveLength(1)
  })

  it('reports an unknown version as not found', async () => {
    const result = await restoreVersion(f.alice, projectId, '00000000-0000-0000-0000-000000000000')

    expect(result).toEqual({ restored: false, reason: 'not_found' })
  })
})
