import { beforeAll, expect, test } from 'vitest'
import { createProvider, deleteProvider, getProviderSecret, listProviders } from './service'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '../db/seed'
import { adminPool } from '../db/pool'

let fixtures: Fixtures

beforeAll(async () => {
  await resetFixtures()
  fixtures = await seedTwoUsersWithProjects()
})

test('encrypts the key and never returns it', async () => {
  const created = await createProvider({
    userId: fixtures.alice,
    kind: 'llm',
    preset: 'deepseek',
    label: 'work',
    model: 'deepseek-chat',
    apiKey: 'sk-live-secret-value',
  })
  expect(created.hasKey).toBe(true)
  expect(created.keyHint).toBe('…alue')
  expect(JSON.stringify(created)).not.toContain('sk-live-secret-value')
  const secret = await getProviderSecret(fixtures.alice, created.id)
  expect(secret.apiKey).toBe('sk-live-secret-value')
})

test('one default per kind per user', async () => {
  const a = await createProvider({
    userId: fixtures.alice,
    kind: 'llm',
    preset: 'deepseek',
    label: 'a',
    model: 'm',
    isDefault: true,
  })
  const b = await createProvider({
    userId: fixtures.alice,
    kind: 'llm',
    preset: 'deepseek',
    label: 'b',
    model: 'm',
    isDefault: true,
  })
  const llms = await listProviders(fixtures.alice, 'llm')
  expect(llms.filter((p) => p.isDefault)).toHaveLength(1)
  expect(llms.find((p) => p.isDefault)?.id).toBe(b.id)
  expect(a.id).not.toBe(b.id)
})

test('bob cannot read or delete alice’s provider', async () => {
  const p = await createProvider({
    userId: fixtures.alice,
    kind: 'llm',
    preset: 'deepseek',
    label: 'x',
    model: 'm',
  })
  await expect(getProviderSecret(fixtures.bob, p.id)).rejects.toMatchObject({
    code: 'not_found',
  })
  await expect(deleteProvider(fixtures.bob, p.id)).resolves.toBeUndefined()
  expect((await listProviders(fixtures.alice, 'llm')).some((q) => q.id === p.id)).toBe(true)
})

test('the delete is recorded with what was deleted, not just its id', async () => {
  const p = await createProvider({
    userId: fixtures.alice,
    kind: 'llm',
    preset: 'deepseek',
    label: 'gone',
    model: 'm',
  })
  await deleteProvider(fixtures.alice, p.id)

  const { rows } = await adminPool().query<{ detail: { label: string; preset: string } }>(
    "select detail from audit_log where action = 'provider.delete' and target_id = $1",
    [p.id],
  )
  expect(rows[0]?.detail.label).toBe('gone')
  expect(rows[0]?.detail.preset).toBe('deepseek')
})

test('refuses a base URL that points inside the network', async () => {
  const count = async () => {
    const result = await adminPool().query<{ n: number }>('select count(*)::int as n from providers')
    return result.rows[0]?.n ?? 0
  }
  const before = await count()

  await expect(
    createProvider({
      userId: fixtures.alice,
      kind: 'llm',
      preset: 'openai_compatible',
      label: 'metadata',
      baseUrl: 'http://169.254.169.254',
      model: 'anything',
    }),
  ).rejects.toThrow(/inside the local network/)

  expect(await count()).toBe(before)
})
