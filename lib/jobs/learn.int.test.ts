import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminPool, closePools } from '@/lib/db/pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import type { ProviderTarget } from '@/lib/providers/client'
import { readMemory } from '@/lib/memory/service'

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
  return {
    ...actual,
    chatComplete: async () => state.reply(),
  }
})

const { parseLearn, runLearn } = await import('./learn')

const target: ProviderTarget = {
  id: '11111111-1111-1111-1111-111111111111',
  preset: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  apiKey: 'sk-secret-key-value',
}

function replyWith(text: string) {
  state.target = target
  state.reply = async () => text
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
})

afterAll(async () => {
  await closePools()
})

describe('parseLearn', () => {
  it('keeps a known kind and falls back to a note for an unknown one', () => {
    const parsed = parseLearn(
      JSON.stringify({
        memories: [
          { path: 'deploy/rollback', title: 'Roll back', body: 'Down then up.', kind: 'procedure' },
          { path: 'deploy/window', title: 'Deploy on Tuesday', body: 'Low traffic.', kind: 'rumour' },
        ],
      }),
    )
    expect(parsed.map((memory) => memory.kind)).toEqual(['procedure', 'note'])
  })

  it('returns nothing for prose or a missing list', () => {
    expect(parseLearn('I learned a lot today.')).toEqual([])
    expect(parseLearn('{"memories":"nope"}')).toEqual([])
  })
})

describe('runLearn', () => {
  it('writes the memories the model distilled', async () => {
    await setLearning(projectId, true)
    replyWith(
      JSON.stringify({
        memories: [
          {
            path: 'deploy/rollback',
            title: 'Roll back with compose down then up',
            body: 'Stop the stack, bring it back up, then check /api/health.',
            kind: 'procedure',
          },
        ],
      }),
    )

    expect(await runLearn({ projectId, transcript: 'we rolled back by hand' })).toEqual({ written: 1 })
    const memory = await readMemory(f.alice, projectId, 'deploy/rollback')
    expect(memory?.title).toBe('Roll back with compose down then up')
    expect(memory?.kind).toBe('procedure')
  })

  it('writes at most three, so one chatty transcript cannot flood a project', async () => {
    await setLearning(projectId, true)
    const memories = Array.from({ length: 5 }, (_, i) => ({
      path: `bulk/m${i}`,
      title: `Fact ${i}`,
      body: `Body ${i}`,
    }))
    replyWith(JSON.stringify({ memories }))

    expect(await runLearn({ projectId, transcript: 'a long session' })).toEqual({ written: 3 })
  })

  it('does nothing when learning is off', async () => {
    replyWith(JSON.stringify({ memories: [{ path: 'a/b', title: 'x', body: 'y' }] }))
    expect(await runLearn({ projectId, transcript: 'anything' })).toEqual({ written: 0 })
  })

  it('does nothing when there is no provider to ask', async () => {
    await setLearning(projectId, true)
    expect(await runLearn({ projectId, transcript: 'anything' })).toEqual({ written: 0 })
  })

  it('does nothing on a reply it cannot use', async () => {
    await setLearning(projectId, true)
    replyWith('Sure! Here is what I found.')
    expect(await runLearn({ projectId, transcript: 'anything' })).toEqual({ written: 0 })
  })
})
