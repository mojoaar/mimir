import { beforeEach, describe, expect, test } from 'vitest'
import { withAdmin } from '../db/tx'
import { resetFixtures, seedTwoUsersWithProjects } from '../db/seed'
import { deleteSetting, writeSetting } from './store'
import { getAnalytics, setAnalytics } from './analytics'
import {
  getBackupSettings,
  getS3Credentials,
  getWebDavCredentials,
  setBackupSettings,
  setS3Credentials,
  setWebDavCredentials,
} from './backup-settings'
import { getEmailSettings, setEmailSettings } from './email-settings'
import { getIpAllowlist, getRequireMfa, setIpAllowlist, setRequireMfa } from './security'
import { getPublicUrl, getSiteSettings, setSiteSettings } from './site'
import { getTimeFormat, setClock, setTimezone } from './time'
import { getLearningDefault, setLearningDefault } from './learning'
import { setEmbeddingConfig } from './embedding'

let actor: string

beforeEach(async () => {
  await resetFixtures()
  const fixtures = await seedTwoUsersWithProjects()
  actor = fixtures.admin
})

describe('site settings', () => {
  test('falls back to the environment seed when no public url is stored', async () => {
    expect(await getPublicUrl()).toBe(process.env.MIMIR_PUBLIC_URL ?? 'http://localhost:3000')
  })

  test('stores and returns the site settings', async () => {
    await setSiteSettings({ publicUrl: 'https://mimir.example.test/', siteName: 'Mimir', metaDescription: 'Memory' }, actor)
    const settings = await getSiteSettings()
    expect(settings).toEqual({
      publicUrl: 'https://mimir.example.test',
      siteName: 'Mimir',
      metaDescription: 'Memory',
    })
    expect(await getPublicUrl()).toBe('https://mimir.example.test')
  })

  test('rejects a public url with a path', async () => {
    await expect(setSiteSettings({ publicUrl: 'https://x.test/mimir' }, actor)).rejects.toMatchObject({
      code: 'invalid_params',
    })
  })

  test('deleting the public url falls back to the seed', async () => {
    await setSiteSettings({ publicUrl: 'https://mimir.example.test' }, actor)
    await deleteSetting('public_url', actor)
    expect(await getPublicUrl()).toBe(process.env.MIMIR_PUBLIC_URL ?? 'http://localhost:3000')
  })
})

describe('security settings', () => {
  test('require_mfa defaults to false and round-trips', async () => {
    expect(await getRequireMfa()).toBe(false)
    await setRequireMfa(true, actor)
    expect(await getRequireMfa()).toBe(true)
  })

  test('the allowlist defaults to empty', async () => {
    expect(await getIpAllowlist()).toEqual([])
  })

  test('the allowlist rejects an invalid entry and names it', async () => {
    await expect(setIpAllowlist(['10.0.0.0/8', 'nope'], actor)).rejects.toThrow(/nope/)
    expect(await getIpAllowlist()).toEqual([])
  })

  test('the allowlist round-trips valid entries', async () => {
    await setIpAllowlist(['10.0.0.0/8', '::1/128'], actor)
    expect(await getIpAllowlist()).toEqual(['10.0.0.0/8', '::1/128'])
  })
})

describe('backup settings', () => {
  test('has defaults', async () => {
    expect(await getBackupSettings()).toEqual({
      enabled: false,
      schedule: '0 3 * * *',
      retention: 14,
      target: null,
    })
  })

  test('rejects a retention below 1', async () => {
    await expect(setBackupSettings({ retention: 0 }, actor)).rejects.toMatchObject({
      code: 'invalid_params',
    })
  })
})

describe('credentials', () => {
  test('the s3 secret is never stored in the clear', async () => {
    await setS3Credentials(
      {
        bucket: 'mimir',
        endpoint: 'https://s3.example.test',
        region: 'us-east-1',
        prefix: 'backups',
        pathStyle: true,
        accessKeyId: 'AKIAEXAMPLE',
        secretAccessKey: 'super-secret-value',
      },
      actor,
    )

    const { rows } = await withAdmin((tx) =>
      tx.query<{ value: unknown }>("select value from settings where key = 'backup_s3'"),
    )
    expect(JSON.stringify(rows[0]?.value)).not.toContain('super-secret-value')

    const stored = await getS3Credentials()
    expect(stored?.secretAccessKey).toBe('super-secret-value')
    expect(stored?.bucket).toBe('mimir')
  })

  test('webdav credentials round-trip', async () => {
    await setWebDavCredentials(
      { baseUrl: 'https://webdav.pcloud.com', username: 'me', password: 'app-password', prefix: 'mimir' },
      actor,
    )
    expect(await getWebDavCredentials()).toMatchObject({ username: 'me', password: 'app-password' })
  })

  test('email settings round-trip and clear', async () => {
    expect(await getEmailSettings()).toBeNull()
    await setEmailSettings({ enabled: true, from: 'mimir@example.test', apiKey: 're_test_key' }, actor)
    expect(await getEmailSettings()).toMatchObject({ enabled: true, apiKey: 're_test_key' })
    await setEmailSettings(null, actor)
    expect(await getEmailSettings()).toBeNull()
  })
})

describe('time settings', () => {
  test('saves the zone and the clock', async () => {
    await setTimezone('Europe/Copenhagen', actor)
    await setClock('12h', actor)
    expect(await getTimeFormat()).toEqual({ timeZone: 'Europe/Copenhagen', clock: '12h' })
  })

  test('refuses a zone that does not exist', async () => {
    await expect(setTimezone('Mars/Olympus_Mons', actor)).rejects.toThrow('not a timezone')
  })
})

describe('learning default', () => {
  test('is off until it is turned on', async () => {
    expect(await getLearningDefault()).toBe(false)
  })

  test('saves both states', async () => {
    await setLearningDefault(true, actor)
    expect(await getLearningDefault()).toBe(true)
    await setLearningDefault(false, actor)
    expect(await getLearningDefault()).toBe(false)
  })
})

describe('analytics', () => {
  test('is off and empty until it is configured', async () => {
    expect(await getAnalytics()).toEqual({ enabled: false, scriptUrl: '', websiteId: '' })
  })

  test('saves the script URL and the website ID', async () => {
    await setAnalytics({ enabled: true, scriptUrl: 'https://stats.example.com/script.js', websiteId: 'abc-123' }, actor)
    expect(await getAnalytics()).toEqual({
      enabled: true,
      scriptUrl: 'https://stats.example.com/script.js',
      websiteId: 'abc-123',
    })
  })

  test('turning it off keeps no stale requirement on the fields', async () => {
    await setAnalytics({ enabled: false, scriptUrl: '', websiteId: '' }, actor)
    expect(await getAnalytics()).toEqual({ enabled: false, scriptUrl: '', websiteId: '' })
  })

  test('refuses a script URL that is not absolute http(s)', async () => {
    await expect(
      setAnalytics({ enabled: true, scriptUrl: '/script.js', websiteId: 'abc-123' }, actor),
    ).rejects.toThrow('absolute http')
  })

  test('refuses to enable without a website ID', async () => {
    await expect(
      setAnalytics({ enabled: true, scriptUrl: 'https://stats.example.com/script.js', websiteId: '  ' }, actor),
    ).rejects.toThrow('website ID')
  })

  test('ignores a corrupt row rather than trusting it', async () => {
    await writeSetting('analytics', { enabled: true, scriptUrl: 'nonsense', websiteId: '' }, actor)
    expect(await getAnalytics()).toEqual({ enabled: false, scriptUrl: '', websiteId: '' })
  })
})

describe('embedding config', () => {
  test('says whether the config actually changed', async () => {
    await setEmbeddingConfig({ providerId: 'p1', model: 'a', dim: 768 }, actor)
    expect((await setEmbeddingConfig({ providerId: 'p1', model: 'a', dim: 768 }, actor)).changed).toBe(
      false,
    )
    expect((await setEmbeddingConfig({ providerId: 'p1', model: 'b', dim: 768 }, actor)).changed).toBe(
      true,
    )
  })
})
