import { describe, expect, it } from 'vitest'
import { loadConfig } from './config'

const base = {
  NODE_ENV: 'test' as const,
  MIMIR_SECRET: 'a'.repeat(64),
  DATABASE_URL: 'postgres://mimir_app:x@db:5432/mimir',
  DATABASE_ADMIN_URL: 'postgres://mimir_owner:x@db:5432/mimir',
}

describe('loadConfig', () => {
  it('accepts a complete environment', () => {
    expect(loadConfig(base).secret).toHaveLength(64)
  })

  it('refuses to boot without MIMIR_SECRET and says how to make one', () => {
    expect(() => loadConfig({ ...base, MIMIR_SECRET: undefined }))
      .toThrow(/openssl rand -hex 32/)
  })

  it('refuses a secret that is not 64 hex characters', () => {
    expect(() => loadConfig({ ...base, MIMIR_SECRET: 'short' })).toThrow(/64 hex/)
  })

  it('rejects a trusted proxy entry that is not a CIDR or IP', () => {
    expect(() => loadConfig({ ...base, MIMIR_TRUSTED_PROXIES: 'not-an-ip' }))
      .toThrow(/MIMIR_TRUSTED_PROXIES/)
  })

  it('defaults trusted proxies to empty', () => {
    expect(loadConfig(base).trustedProxies).toEqual([])
  })
})
