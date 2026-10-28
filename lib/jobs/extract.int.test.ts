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

const jobs = vi.hoisted(() => ({ send: vi.fn(async () => 'job-1') }))

vi.mock('@/lib/jobs/boss', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/jobs/boss')>()
  return { ...actual, sendJob: jobs.send }
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

  it('leaves the row intact when the provider fails, and fails the job so the queue retries', async () => {
    await setLearning(projectId, true)
    withFakeCompletionFailing()
    await expect(runExtract({ projectId })).rejects.toThrow(/provider responded 500/)
    expect((await readMemory(f.alice, projectId, 'deploy/rollback'))?.title).toBe(
      'Roll back with compose down then up.',
    )
  })

  // Newest-first meant a slow model re-read the same burst and never reached
  // the rows behind it; the live install had summaries on 1 of 5 memories.
  it('works from the oldest memory forward, so nothing is starved', async () => {
    await setLearning(projectId, true)
    for (let i = 1; i <= 21; i += 1) {
      const path = `bulk/m${String(i).padStart(2, '0')}`
      await writeMemory({ userId: f.alice, projectId, path, body: `body ${i}` })
      await adminPool().query(
        `update memories set updated_at = now() - ($3 || ' minutes')::interval
          where project_id = $1 and lower(path) = $2`,
        [projectId, path, String(22 - i)],
      )
    }
    // Take the fixture row out of the queue so exactly 21 memories are pending.
    await adminPool().query(
      `update memories set summary = 'already known' where project_id = $1 and lower(path) = 'deploy/rollback'`,
      [projectId],
    )
    withFakeCompletion('{"title":"Bulk row","summary":"One of the bulk memories."}')

    const result = await runExtract({ projectId })

    expect(result.extracted).toBe(20)
    const { rows } = await adminPool().query<{ path: string }>(
      `select path from memories where project_id = $1 and summary is null and deleted_at is null`,
      [projectId],
    )
    expect(rows.map((row) => row.path)).toEqual(['bulk/m21'])
  })

  it('leaves the row intact when the reply cannot be parsed', async () => {
    await setLearning(projectId, true)
    withFakeCompletion('I am not JSON, sorry.')
    expect(await runExtract({ projectId })).toEqual({ extracted: 0 })
    expect((await readMemory(f.alice, projectId, 'deploy/rollback'))?.summary).toBeNull()
  })

  // A skipped row keeps `summary is null`, so only the next write to the
  // project would pick it up again - and nothing else might ever write. Ask
  // for it once more on its own, with a backoff.
  it('asks again for a row the model could not summarise', async () => {
    await setLearning(projectId, true)
    withFakeCompletion('I am not JSON, sorry.')
    jobs.send.mockClear()
    const row = await readMemory(f.alice, projectId, 'deploy/rollback')

    await runExtract({ projectId })

    expect(jobs.send).toHaveBeenCalledWith(
      'extract',
      { projectId, attempts: { [row!.id]: 1 } },
      { singletonKey: projectId, startAfter: 60 },
    )
  })

  it('stops asking after three tries, so one bad row cannot cost calls forever', async () => {
    await setLearning(projectId, true)
    withFakeCompletion('I am not JSON, sorry.')
    jobs.send.mockClear()
    const row = await readMemory(f.alice, projectId, 'deploy/rollback')

    expect(await runExtract({ projectId, attempts: { [row!.id]: 2 } })).toEqual({ extracted: 0 })
    expect(jobs.send).not.toHaveBeenCalled()
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
