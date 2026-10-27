import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { adminPool, closePools } from '@/lib/db/pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import { writeMemory } from '@/lib/memory/service'
import { embeddingCoverage, embeddingCalls, jobCounts, queueHealth, recentJobs } from './service'

let f: Fixtures
let projectId: string

beforeEach(async () => {
  await adminPool().query(`delete from pgboss.job where data->>'test' = 'jobs-service'`)
  await adminPool().query('delete from provider_calls')
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
  projectId = f.aliceProjectId
})

afterAll(async () => {
  await adminPool().query(`delete from pgboss.job where data->>'test' = 'jobs-service'`)
  await closePools()
})

async function insertJob(output: unknown, state = 'failed'): Promise<void> {
  await adminPool().query(
    `insert into pgboss.job (name, state, data, output, created_on)
     values ('extract', $1::pgboss.job_state, '{"test":"jobs-service"}'::jsonb, $2::jsonb, now())`,
    [state, JSON.stringify(output)],
  )
}

describe('the job read model', () => {
  it('knows the queue exists', async () => {
    expect(await queueHealth()).toEqual({ started: true })
  })

  it('reads a failed job without its stack', async () => {
    await insertJob({
      name: 'TypeError',
      cause: { message: 'bad port', stack: 'Error: bad port\n    at makeNetworkError' },
    })

    const rows = await recentJobs(50)
    const row = rows.find((entry) => entry.detail === 'bad port')

    expect(row?.state).toBe('failed')
    expect(row?.detail).toBe('bad port')
    expect(JSON.stringify(rows)).not.toContain('at makeNetworkError')
  })

  it('reads a finished job as the number it reports', async () => {
    await insertJob({ embedded: 12 }, 'completed')

    const rows = await recentJobs(50)
    expect(rows.some((entry) => entry.detail === '12 embedded')).toBe(true)
  })

  it('counts the last seven days by name and state', async () => {
    await insertJob({}, 'completed')
    await insertJob({}, 'failed')

    const counts = await jobCounts(7)
    expect(counts.find((entry) => entry.name === 'extract' && entry.state === 'failed')?.count).toBeGreaterThanOrEqual(1)
  })

  it('separates missing, unknown and known models', async () => {
    await writeMemory({ userId: f.alice, projectId, path: 'a/missing', body: 'no vector' })
    await writeMemory({ userId: f.alice, projectId, path: 'a/unknown', body: 'vector, no stamp' })
    await writeMemory({ userId: f.alice, projectId, path: 'a/known', body: 'vector, stamped' })

    await adminPool().query(
      `update memories set embedding = array_fill(0.1, array[768])::vector, embedded_at = now()
        where project_id = $1 and path = 'a/unknown'`,
      [projectId],
    )
    await adminPool().query(
      `update memories
          set embedding = array_fill(0.2, array[768])::vector, embedded_at = now(),
              embedding_model = 'nomic-embed-text'
        where project_id = $1 and path = 'a/known'`,
      [projectId],
    )

    const coverage = await embeddingCoverage()

    expect(coverage.total).toBe(3)
    expect(coverage.embedded).toBe(2)
    expect(coverage.missing).toBe(1)
    expect(coverage.lastEmbeddedAt).not.toBeNull()
    expect(coverage.models).toContainEqual({ model: 'unknown', count: 2 })
    expect(coverage.models).toContainEqual({ model: 'nomic-embed-text', count: 1 })
    expect(coverage.projects[0]?.embedded).toBe(2)
  })

  it('counts embedding calls by purpose and their failures', async () => {
    for (const [purpose, ok] of [
      ['embed.ingest', true],
      ['embed.search', true],
      ['embed.search', false],
    ] as const) {
      await adminPool().query(
        `insert into provider_calls (preset, model, kind, purpose, prompt_tokens, completion_tokens, status, ok)
         values ('ollama', 'nomic-embed-text', 'embedding', $1, 10, 0, $2, $3)`,
        [purpose, ok ? 200 : 500, ok],
      )
    }

    const calls = await embeddingCalls(24)
    expect(calls.find((entry) => entry.purpose === 'embed.search')).toMatchObject({
      count: 2,
      failures: 1,
    })
  })
})
