import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminPool, closePools } from '@/lib/db/pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import type { ProviderTarget } from '@/lib/providers/client'
import { writeMemory } from '@/lib/memory/service'

const state = vi.hoisted(() => ({
  target: null as ProviderTarget | null,
  vectors: (async () => []) as () => Promise<number[]>,
}))

vi.mock('@/lib/providers/resolve', () => ({
  resolveEmbeddingProvider: async () => state.target,
}))

vi.mock('@/lib/providers/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/providers/client')>()
  return { ...actual, embed: async () => [await state.vectors()] }
})

const { runBackfill } = await import('./backfill')

const target: ProviderTarget = {
  id: '11111111-1111-1111-1111-111111111111',
  preset: 'ollama',
  baseUrl: 'http://127.0.0.1:11434',
  model: 'nomic-embed-text',
  apiKey: null,
}

let f: Fixtures
let projectId: string

beforeEach(async () => {
  state.target = null
  state.vectors = async () => []
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
  projectId = f.aliceProjectId
})

afterAll(async () => {
  await closePools()
})

async function countNullEmbeddings(): Promise<number> {
  const { rows } = await adminPool().query<{ n: number }>(
    `select count(*)::int as n from memories where project_id = $1 and embedding is null`,
    [projectId],
  )
  return rows[0]?.n ?? 0
}

describe('the backfill job', () => {
  it('embeds the null rows and nothing else', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'a/one', body: 'first' })
    await writeMemory({ userId: f.alice, projectId, path: 'a/two', body: 'second' })
    // one row already carries a vector and must not be re-embedded
    state.target = target
    state.vectors = async () => new Array(768).fill(0.5)
    await writeMemory({ userId: f.alice, projectId, path: 'a/three', body: 'third' })
    expect(await countNullEmbeddings()).toBe(2)

    state.vectors = async () => new Array(768).fill(0.25)
    const result = await runBackfill({})

    expect(result.embedded).toBe(2)
    expect(await countNullEmbeddings()).toBe(0)
  })

  it('does nothing when no embedding provider is configured', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'a/one', body: 'first' })

    expect(await runBackfill({})).toEqual({ embedded: 0 })
    expect(await countNullEmbeddings()).toBe(1)
  })
})
