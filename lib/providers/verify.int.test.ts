import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest'

import { closePools } from '../db/pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '../db/seed'
import { resolveProject } from '../projects/service'
import { createProvider, listProviders } from './service'
import { resolveExtractionProvider } from './resolve'
import { verifyProvider } from './verify'

let fixtures: Fixtures

beforeAll(async () => {
  await resetFixtures()
  fixtures = await seedTwoUsersWithProjects()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

afterAll(async () => {
  await closePools()
})

test('records success and the probed dimension', async () => {
  const p = await createProvider({
    userId: fixtures.admin,
    kind: 'embedding',
    preset: 'openai_compatible',
    label: 'e',
    baseUrl: 'https://x.test',
    model: 'm',
    apiKey: 'k',
    dim: 768,
  })
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ data: [{ embedding: new Array(768).fill(0.1) }] })))

  expect(await verifyProvider(fixtures.admin, p.id)).toEqual({ ok: true, dim: 768 })

  const [row] = await listProviders(fixtures.admin, 'embedding')
  expect(row?.lastError).toBeNull()
  expect(row?.lastVerifiedAt).not.toBeNull()
})

test('records the failure without the key', async () => {
  const p = await createProvider({
    userId: fixtures.admin,
    kind: 'llm',
    preset: 'deepseek',
    label: 'l',
    model: 'm',
    apiKey: 'sk-secret-key-value',
  })
  vi.stubGlobal('fetch', async () => new Response('nope', { status: 401 }))

  const result = await verifyProvider(fixtures.admin, p.id)

  expect(result).toMatchObject({ ok: false })
  expect(JSON.stringify(result)).not.toContain('sk-secret-key-value')
})

test('an extraction provider is never taken from another user', async () => {
  const project = await resolveProject(fixtures.bob, { repo: 'github.com/bob/own-repo', create: true })

  expect(await resolveExtractionProvider(project.id)).toBeNull()
})
