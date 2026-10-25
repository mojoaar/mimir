import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminPool, closePools } from '@/lib/db/pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import type { ProviderTarget } from '@/lib/providers/client'
import { searchMemories } from './search'
import { writeMemory } from './service'

const state = vi.hoisted(() => ({
  target: null as ProviderTarget | null,
  vectors: (async () => []) as () => Promise<number[]>,
  resolverThrows: false,
}))

vi.mock('@/lib/providers/resolve', () => ({
  resolveEmbeddingProvider: async () => {
    if (state.resolverThrows) throw new Error('cannot decrypt: wrong key or tampered data')
    return state.target
  },
}))

vi.mock('@/lib/providers/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/providers/client')>()
  return { ...actual, embed: async () => [await state.vectors()] }
})

const { embedText } = await import('./embeddings')

const target: ProviderTarget = {
  id: '11111111-1111-1111-1111-111111111111',
  preset: 'ollama',
  baseUrl: 'http://127.0.0.1:11434',
  model: 'nomic-embed-text',
  apiKey: null,
}

function withVector(values: number[]) {
  state.target = target
  state.vectors = async () => values
}

function withFailingProvider() {
  state.target = target
  state.vectors = async () => {
    throw new Error('provider responded 500')
  }
}

let f: Fixtures
let projectId: string

beforeEach(async () => {
  state.target = null
  state.vectors = async () => []
  state.resolverThrows = false
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
  projectId = f.aliceProjectId
})

afterAll(async () => {
  await closePools()
})

async function embeddingOf(path: string): Promise<number[] | null> {
  const { rows } = await adminPool().query<{ e: string | null }>(
    `select embedding::text as e from memories where project_id = $1 and lower(path) = $2`,
    [projectId, path],
  )
  return rows[0]?.e ? (JSON.parse(rows[0].e) as number[]) : null
}

describe('embedding on write', () => {
  it('a write succeeds and stays searchable with no embedding provider', async () => {
    const result = await writeMemory({
      userId: f.alice,
      projectId,
      path: 'deploy/rollback',
      body: 'Rollback: compose down then up.',
    })

    expect(result.created).toBe(true)
    const hits = await searchMemories({ userId: f.alice, projectId, query: 'rollback' })
    expect(hits[0]?.path).toBe('deploy/rollback')
    expect(await embeddingOf('deploy/rollback')).toBeNull()
  })

  it('a write stores a vector when the provider answers', async () => {
    withVector(new Array(768).fill(0.5))

    await writeMemory({
      userId: f.alice,
      projectId,
      path: 'deploy/rollback',
      body: 'Roll back with compose down then up.',
    })

    expect(await embeddingOf('deploy/rollback')).toHaveLength(768)
  })

  it('a provider failure does not fail the write', async () => {
    withFailingProvider()

    const result = await writeMemory({
      userId: f.alice,
      projectId,
      path: 'deploy/rollback',
      body: 'Roll back with compose down then up.',
    })

    expect(result.created).toBe(true)
    expect(await embeddingOf('deploy/rollback')).toBeNull()
  })

  it('a rewrite replaces the old vector instead of keeping it', async () => {
    withVector(new Array(768).fill(0.25))
    await writeMemory({ userId: f.alice, projectId, path: 'deploy/rollback', body: 'first' })

    withVector(new Array(768).fill(0.75))
    await writeMemory({ userId: f.alice, projectId, path: 'deploy/rollback', body: 'second' })

    const vector = (await embeddingOf('deploy/rollback'))!
    expect(vector[0]).toBeCloseTo(0.75)
  })

  it('a vector of the wrong size is refused rather than stored', async () => {
    withVector(new Array(1024).fill(0.5))

    await writeMemory({ userId: f.alice, projectId, path: 'a/b', body: 'body' })

    expect(await embeddingOf('a/b')).toBeNull()
  })

  it('a vector of the right size but not numbers is refused rather than stored', async () => {
    state.target = target
    state.vectors = async () => new Array(768).fill('x') as unknown as number[]

    const result = await writeMemory({
      userId: f.alice,
      projectId,
      path: 'deploy/rollback',
      body: 'Rollback: compose down then up.',
    })

    expect(result.created).toBe(true)
    expect(await embeddingOf('deploy/rollback')).toBeNull()
    const hits = await searchMemories({ userId: f.alice, projectId, query: 'rollback' })
    expect(hits[0]?.path).toBe('deploy/rollback')
  })

  it('a provider that cannot even be resolved does not fail the write', async () => {
    state.resolverThrows = true

    const result = await writeMemory({
      userId: f.alice,
      projectId,
      path: 'deploy/rollback',
      body: 'Rollback: compose down then up.',
    })

    expect(result.created).toBe(true)
    expect(await embeddingOf('deploy/rollback')).toBeNull()
    const hits = await searchMemories({ userId: f.alice, projectId, query: 'rollback' })
    expect(hits[0]?.path).toBe('deploy/rollback')
  })

  it('embedText truncates a long body before sending it', async () => {
    let sent = ''
    state.target = target
    state.vectors = async () => new Array(768).fill(0)

    vi.resetModules()
    const client = await import('@/lib/providers/client')
    vi.spyOn(client, 'embed').mockImplementation(async (_target, input) => {
      sent = input[0]!
      return [new Array(768).fill(0)]
    })

    await embedText('x'.repeat(9000))

    expect(sent).toHaveLength(8000)
  })
})
