import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminPool, closePools } from '@/lib/db/pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import { ProviderError, type ProviderTarget } from '@/lib/providers/client'
import { readMemory, writeMemory } from '@/lib/memory/service'
import { searchMemories } from '@/lib/memory/search'

const state = vi.hoisted(() => ({
  target: null as ProviderTarget | null,
  reply: (async () => '') as () => Promise<string>,
  timeoutMs: null as number | null,
}))

vi.mock('@/lib/providers/resolve', () => ({
  resolveExtractionProvider: async () => state.target,
  resolveEmbeddingProvider: async () => null,
}))

vi.mock('@/lib/providers/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/providers/client')>()
  return {
    ...actual,
    chatComplete: async (_target: ProviderTarget, _messages: unknown, deps?: { timeoutMs?: number }) => {
      state.timeoutMs = deps?.timeoutMs ?? null
      return state.reply()
    },
  }
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

  // A 9B model on a laptop takes far longer than the client's 10 s default to
  // answer, and the first call also loads the model into memory. Extraction is
  // background work with nobody waiting, so it gets a budget sized for that.
  it('gives a slow local model time to answer', async () => {
    await setLearning(projectId, true)
    withFakeCompletion('{"title":"Roll back","summary":"Stop, then start."}')
    await runExtract({ projectId })
    expect(state.timeoutMs).toBeGreaterThanOrEqual(60_000)
  })

  // A thinking model can spend the whole token budget reasoning and send back
  // no answer at all. That is one useless reply, not a broken provider, so it
  // must not stall the rows behind it.
  it('skips a reply that came back empty and carries on', async () => {
    await setLearning(projectId, true)
    await writeMemory({
      userId: f.alice,
      projectId,
      path: 'deploy/compose',
      body: 'Compose publishes only 127.0.0.1:3000.',
    })

    let call = 0
    state.target = target
    state.reply = async () => {
      call += 1
      if (call === 1) throw new ProviderError('empty completion', undefined, 'empty_completion')
      return '{"title":"Compose binds to loopback","summary":"Only the proxy can reach the app."}'
    }

    expect(await runExtract({ projectId })).toEqual({ extracted: 1 })
  })
})
