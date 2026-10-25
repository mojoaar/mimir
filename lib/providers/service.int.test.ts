import { beforeAll, expect, test } from 'vitest'
import { createProvider, deleteProvider, getProviderSecret, listProviders } from './service'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '../db/seed'

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
