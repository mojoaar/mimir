import { beforeAll, expect, test } from 'vitest'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '../db/seed'
import {
  deleteSetting,
  readSetting,
  writeSetting,
} from './store'
import { setEmbeddingConfig } from './embedding'

let fixtures: Fixtures

beforeAll(async () => {
  await resetFixtures()
  fixtures = await seedTwoUsersWithProjects()
})

test('round-trips a setting', async () => {
  await writeSetting('site_name', { value: 'Mimir' }, null)
  expect(await readSetting<{ value: string }>('site_name')).toEqual({ value: 'Mimir' })
  await deleteSetting('site_name')
  expect(await readSetting('site_name')).toBeNull()
})

test('refuses an embedding dimension the column cannot hold', async () => {
  await expect(
    setEmbeddingConfig({ providerId: crypto.randomUUID(), model: 'm', dim: 1024 }, fixtures.admin),
  ).rejects.toMatchObject({ code: 'invalid_params' })
})
