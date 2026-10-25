import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminPool, closePools } from '@/lib/db/pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import type { ProviderTarget } from '@/lib/providers/client'
import { readMemory, writeMemory } from '@/lib/memory/service'
import { searchMemories } from '@/lib/memory/search'

const state = vi.hoisted(() => ({
  target: null as ProviderTarget | null,
  reply: (async () => '') as () => Promise<string>,
}))

vi.mock('@/lib/providers/resolve', () => ({
  resolveExtractionProvider: async () => state.target,
  resolveEmbeddingProvider: async () => null,
}))

vi.mock('@/lib/providers/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/providers/client')>()
  return { ...actual, chatComplete: async () => state.reply() }
})

const { runExtract } = await import('./extract')

const target: ProviderTarget = {
  id: '11111111-1111-1111-1111-111111111111',
  preset: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  apiKey: 'sk-secret-key-value',
}

function withFakeCompletion(text: string) {
  state.target = target
  state.reply = async () => text
}

function withFakeCompletionFailing() {
  state.target = target
  state.reply = async () => {
    throw new Error('provider responded 500')
  }
}

async function setLearning(projectId: string, enabled: boolean): Promise<void> {
  await adminPool().query('update projects set learning_enabled = $2 where id = $1', [projectId, enabled])
}

let f: Fixtures
let projectId: string

beforeEach(async () => {
  state.target = null
  state.reply = async () => ''
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
  projectId = f.aliceProjectId
  await writeMemory({
    userId: f.alice,
    projectId,
    path: 'deploy/rollback',
    body: 'Rollback: compose down then up.',
    title: 'Roll back with compose down then up.',
  })
})

afterAll(async () => {
  await closePools()
})

describe('runExtract', () => {
  it('fills title and summary for a learning-enabled project', async () => {
    await setLearning(projectId, true)
    withFakeCompletion('{"title":"Roll back with compose","summary":"Stop the stack, then bring it up again."}')
    const result = await runExtract({ projectId })
    expect(result.extracted).toBe(1)
    const hit = await searchMemories({ userId: f.alice, projectId, query: 'rollback' })
    expect(hit[0]?.summary).toBe('Stop the stack, then bring it up again.')
  })

  it('does nothing when learning is off', async () => {
    withFakeCompletion('{"title":"x","summary":"y"}')
    expect(await runExtract({ projectId })).toEqual({ extracted: 0 })
  })

  it('leaves the row intact when the provider fails', async () => {
    await setLearning(projectId, true)
    withFakeCompletionFailing()
    expect(await runExtract({ projectId })).toEqual({ extracted: 0 })
    expect((await readMemory(f.alice, projectId, 'deploy/rollback'))?.title).toBe(
      'Roll back with compose down then up.',
    )
  })

  it('leaves the row intact when the reply cannot be parsed', async () => {
    await setLearning(projectId, true)
    withFakeCompletion('I am not JSON, sorry.')
    expect(await runExtract({ projectId })).toEqual({ extracted: 0 })
    expect((await readMemory(f.alice, projectId, 'deploy/rollback'))?.summary).toBeNull()
  })
})
