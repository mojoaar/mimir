import { beforeEach, expect, test } from 'vitest'
import { withAdmin, withService } from '@/lib/db/tx'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import { recordCall } from './record'

let f: Fixtures

beforeEach(async () => {
  // Calls carry no foreign key, so they outlive the fixtures and must be cleared.
  await withAdmin((tx) => tx.query('delete from provider_calls'))
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
})

test('writes a call through the owner connection', async () => {
  await recordCall({
    userId: f.alice,
    providerId: '00000000-0000-0000-0000-000000000001',
    preset: 'deepseek',
    model: 'deepseek-flash',
    kind: 'llm',
    purpose: 'extract',
    promptTokens: 1000,
    completionTokens: 200,
    costMicros: 270,
    status: 200,
    ok: true,
  })

  const { rows } = await withAdmin((tx) =>
    tx.query('select user_id, cost_micros, ok from provider_calls'),
  )
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ user_id: f.alice, cost_micros: '270', ok: true })
})

test('is not readable by the application role', async () => {
  await expect(withService((tx) => tx.query('select 1 from provider_calls'))).rejects.toMatchObject(
    { code: '42501' },
  )
})

test('never breaks the call it describes when the write fails', async () => {
  // A model name longer than the column would fail; recording must swallow it.
  await expect(
    recordCall({
      userId: f.alice,
      providerId: 'p',
      preset: 'deepseek',
      model: 'x'.repeat(10_000),
      kind: 'llm',
      purpose: 'extract',
      promptTokens: 1,
      completionTokens: 1,
      costMicros: 1,
      status: 200,
      ok: true,
    }),
  ).resolves.toBeUndefined()
})
