import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminPool, closePools } from '@/lib/db/pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import type { ProviderTarget } from '@/lib/providers/client'
import { deleteMemory, writeMemory } from '@/lib/memory/service'

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

const { runReembed } = await import('./reembed')

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
  state.target = target
  state.vectors = async () => new Array(768).fill(0.5)
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
  projectId = f.aliceProjectId
})

afterAll(async () => {
  await closePools()
})

async function liveRows(embeddingIsNull: boolean): Promise<number> {
  const { rows } = await adminPool().query<{ n: number }>(
    `select count(*)::int as n from memories
      where project_id = $1 and deleted_at is null and (embedding is null) = $2`,
    [projectId, embeddingIsNull],
  )
  return rows[0]?.n ?? 0
}

async function writeThreeEmbeddedMemoriesAndOneDeleted() {
  for (const path of ['a/one', 'a/two', 'a/three']) {
    await writeMemory({ userId: f.alice, projectId, path, body: `body of ${path}` })
  }
  await writeMemory({ userId: f.alice, projectId, path: 'a/gone', body: 'deleted' })
  await deleteMemory(f.alice, projectId, 'a/gone')
  expect(await liveRows(false)).toBe(3)
}

describe('the re-embed job', () => {
  it('nulls every live vector, leaves deleted rows alone, and refills', async () => {
    await writeThreeEmbeddedMemoriesAndOneDeleted()
    state.vectors = async () => new Array(768).fill(0.25)

    expect(await runReembed({ confirm: true })).toEqual({ total: 3, missing: 0 })
    expect(await liveRows(true)).toBe(0)
  })

  it('finishes a project larger than one backfill pass', async () => {
    // A pass stops once MAX_ROWS is reached, in whole batches, so 2,500 rows
    // leaves the tail unembedded. The old code threw here and the retry
    // re-nulled everything it had just built.
    await adminPool().query(
      `insert into memories (project_id, path, body)
       select $1, 'big/' || g, 'body ' || g from generate_series(1, 2500) g`,
      [projectId],
    )

    const result = await runReembed({ confirm: true })
    expect(result.missing).toBe(0)
    expect(await liveRows(true)).toBe(0)
  })

  it('refuses without an explicit confirmation', async () => {
    await writeThreeEmbeddedMemoriesAndOneDeleted()

    await expect(runReembed({} as { confirm: true })).rejects.toMatchObject({
      code: 'invalid_params',
    })
    expect(await liveRows(false)).toBe(3)
  })

  it('refuses to drop anything when no embedding provider is configured', async () => {
    await writeThreeEmbeddedMemoriesAndOneDeleted()
    state.target = null

    await expect(runReembed({ confirm: true })).rejects.toMatchObject({
      code: 'invalid_params',
    })
    expect(await liveRows(false)).toBe(3)
  })

  it('fails loudly when the provider dies mid-run instead of reporting a clean rebuild', async () => {
    await writeThreeEmbeddedMemoriesAndOneDeleted()
    state.vectors = async () => {
      throw new Error('provider responded 500')
    }

    await expect(runReembed({ confirm: true })).rejects.toThrow(/still without a vector/)
  })
})
