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
