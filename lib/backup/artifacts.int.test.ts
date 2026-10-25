import { beforeEach, describe, expect, it } from 'vitest'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import { createProvider } from '@/lib/providers/service'
import { setS3Credentials } from '@/lib/settings/backup-settings'
import { buildSettingsExport } from './settings-export'

let f: Fixtures

beforeEach(async () => {
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
})

describe('the settings export', () => {
  it('carries what an operator needs and nothing that can be spent', async () => {
    await createProvider({
      userId: f.alice,
      kind: 'llm',
      preset: 'deepseek',
      label: 'work',
      model: 'deepseek-chat',
      apiKey: 'sk-live-this-is-the-real-key',
    })
    await setS3Credentials(
      {
        bucket: 'mimir',
        endpoint: 'https://s3.example.test',
        region: 'eu-west-1',
        prefix: 'backups',
        pathStyle: true,
        accessKeyId: 'AKIAEXAMPLE',
        secretAccessKey: 'super-secret-value',
      },
      f.admin,
    )

    const exported = await buildSettingsExport()
    const text = JSON.stringify(exported)

    expect(text).toContain('work')
    expect(text).toContain('deepseek-chat')
    expect(exported.projects.length).toBeGreaterThan(0)
    expect(text).not.toContain('sk-live-this-is-the-real-key')
    expect(text).not.toContain('super-secret-value')
    expect(text).not.toContain('api_key_enc')
    expect(text).not.toContain('"cipher"')
  })
})
