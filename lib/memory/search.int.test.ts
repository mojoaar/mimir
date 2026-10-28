import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { closePools } from '@/lib/db/pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import { searchMemories } from './search'
import { resolveProject } from '@/lib/projects/service'
import { writeMemory } from './service'

const mocks = vi.hoisted(() => ({
  embed: vi.fn(),
  resolveEmbeddingProvider: vi.fn(),
}))

vi.mock('@/lib/providers/client', () => ({ embed: mocks.embed }))
vi.mock('@/lib/providers/resolve', () => ({
  resolveEmbeddingProvider: mocks.resolveEmbeddingProvider,
}))

// Two well-separated 768-dimension vectors: "about rotation" and everything else.
const ROTATION = [1, ...Array(767).fill(0)]
const OTHER = [0, 1, ...Array(766).fill(0)]
const target = { id: 'p1', preset: 'ollama', baseUrl: 'http://ollama', model: 'nomic', apiKey: null }

let f: Fixtures
let projectId: string

beforeEach(async () => {
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
  projectId = f.aliceProjectId
  mocks.embed.mockReset()
  mocks.resolveEmbeddingProvider.mockReset()
  mocks.resolveEmbeddingProvider.mockResolvedValue(null)
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

describe('the vector arm', () => {
  it('finds a memory whose words the query does not contain', async () => {
    mocks.resolveEmbeddingProvider.mockResolvedValue(target)
    mocks.embed.mockImplementation(async (_provider: unknown, texts: string[]) =>
      texts.map((text) => (/rotation|refresh-token/.test(text) ? ROTATION : OTHER)),
    )

    await writeMemory({
      userId: f.alice,
      projectId,
      path: 'auth/refresh-token-lifetime',
      title: 'Refresh token lifetime',
      body: 'the refresh token lives for thirty days',
    })

    // "rotation" appears nowhere in that memory, so the keyword arm finds nothing.
    const hits = await searchMemories({
      userId: f.alice,
      projectId,
      query: 'token rotation',
    })

    expect(hits.map((hit) => hit.path)).toContain('auth/refresh-token-lifetime')
  })

  it('still answers from keywords when every vector is null', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'deploy', body: 'rollback the deploy' })

    const hits = await searchMemories({ userId: f.alice, projectId, query: 'rollback' })

    expect(hits.map((hit) => hit.path)).toEqual(['deploy'])
  })

  it('returns nothing for an empty query even with a provider configured', async () => {
    mocks.resolveEmbeddingProvider.mockResolvedValue(target)
    mocks.embed.mockImplementation(async (_provider: unknown, texts: string[]) =>
      texts.map(() => OTHER),
    )

    await writeMemory({ userId: f.alice, projectId, path: 'deploy', body: 'rollback the deploy' })

    expect(await searchMemories({ userId: f.alice, projectId, query: '  ' })).toEqual([])
  })

  it('still answers from keywords when the provider fails', async () => {
    mocks.resolveEmbeddingProvider.mockResolvedValue(target)
    mocks.embed.mockRejectedValue(new Error('provider responded 500'))

    await writeMemory({ userId: f.alice, projectId, path: 'deploy', body: 'rollback the deploy' })

    const hits = await searchMemories({ userId: f.alice, projectId, query: 'rollback' })

    expect(hits.map((hit) => hit.path)).toEqual(['deploy'])
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

describe('across projects', () => {
  it('finds a memory in another project and says which project it came from', async () => {
    const second = await resolveProject(f.alice, { repo: 'github.com/alice/second', create: true })
    await writeMemory({ userId: f.alice, projectId, path: 'auth/jwt', body: 'refresh tokens rotate on use' })
    await writeMemory({
      userId: f.alice,
      projectId: second.id,
      path: 'deploy/rollback',
      body: 'roll back by redeploying the previous image',
    })

    const hits = await searchMemories({ userId: f.alice, query: 'redeploying image' })

    expect(hits.map((hit) => `${hit.projectSlug}/${hit.path}`)).toEqual([
      `${second.slug}/deploy/rollback`,
    ])
    expect(hits[0]!.projectName).not.toBe('')
  })

  it('does not reach a project the caller cannot read', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'auth/jwt', body: 'refresh tokens rotate on use' })

    expect(await searchMemories({ userId: f.bob, query: 'refresh tokens' })).toEqual([])
  })

  it('quotes the body across projects, and leaves the project search as it was', async () => {
    await writeMemory({
      userId: f.alice,
      projectId,
      path: 'deploy/rollback',
      body: 'roll back by redeploying the previous image',
    })

    const [everywhere] = await searchMemories({ userId: f.alice, query: 'redeploying image' })
    expect(everywhere!.summary).toBeNull()
    expect(everywhere!.excerpt).toContain('redeploying')

    const [scoped] = await searchMemories({ userId: f.alice, projectId, query: 'redeploying image' })
    expect(scoped!.excerpt).toBeNull()
  })
})
