import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closePools } from '@/lib/db/pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import { searchMemories } from './search'
import { writeMemory } from './service'

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

describe('searchMemories', () => {
  it('finds a memory by keyword and returns L0 and L1 only', async () => {
    await writeMemory({
      userId: f.alice,
      projectId,
      path: 'auth/jwt',
      body: 'refresh tokens rotate on use',
    })

    const [hit] = await searchMemories({ userId: f.alice, projectId, query: 'refresh tokens' })

    expect(hit!.path).toBe('auth/jwt')
    expect(hit).not.toHaveProperty('body')
    expect(hit!.score).toBeGreaterThan(0)
  })

  it('scopes results to a path prefix', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'auth/token', body: 'token rotation' })
    await writeMemory({ userId: f.alice, projectId, path: 'deploy/token', body: 'token rotation' })

    const hits = await searchMemories({
      userId: f.alice,
      projectId,
      query: 'token rotation',
      pathPrefix: 'deploy',
    })

    expect(hits.map((hit) => hit.path)).toEqual(['deploy/token'])
  })

  it('returns an empty list for a stopword-only query', async () => {
    expect(await searchMemories({ userId: f.alice, projectId, query: 'the and of' })).toEqual([])
  })

  it('returns an empty list for an empty query', async () => {
    expect(await searchMemories({ userId: f.alice, projectId, query: '   ' })).toEqual([])
  })
})

describe('literal path prefixes', () => {
  it('does not let an underscore act as a wildcard', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'a_b/one', body: 'snake' })
    await writeMemory({ userId: f.alice, projectId, path: 'axb/two', body: 'snake' })

    const hits = await searchMemories({
      userId: f.alice,
      projectId,
      query: 'snake',
      pathPrefix: 'a_b',
    })
    expect(hits.map((hit) => hit.path)).toEqual(['a_b/one'])
  })

  it('includes a memory stored at exactly the prefix path', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'deploy', body: 'deploy notes' })
    await writeMemory({ userId: f.alice, projectId, path: 'deploy/runbook', body: 'deploy notes' })

    const hits = await searchMemories({
      userId: f.alice,
      projectId,
      query: 'deploy',
      pathPrefix: 'deploy',
    })
    expect(hits.map((hit) => hit.path).sort()).toEqual(['deploy', 'deploy/runbook'])
  })
})
