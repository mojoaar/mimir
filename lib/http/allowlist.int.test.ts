import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'

// The integration setup does not set this, and without a trusted proxy there is
// no client address at all - a non-empty allowlist then denies everything.
process.env.MIMIR_TRUSTED_PROXIES = '127.0.0.1'

const { setIpAllowlist } = await import('@/lib/settings/security')
const { getCachedAllowlist, invalidateAllowlistCache, isRequestAllowed } = await import('./allowlist')
const { resetFixtures, seedTwoUsersWithProjects } = await import('@/lib/db/seed')
const { createApiKey } = await import('@/lib/auth/apikey')
const { withAudit } = await import('./audited')
const { getConfig } = await import('@/lib/config')

function request(headers: Record<string, string>) {
  return new NextRequest('http://localhost:3000/api/v1/projects', { headers })
}

describe('the ip allowlist at the request boundary', () => {
  it('denies an address outside the list and allows one inside', async () => {
    const f = await resetFixtures().then(() => seedTwoUsersWithProjects())
    await setIpAllowlist(['10.0.0.0/8'], f.admin)
    invalidateAllowlistCache()

    // With a trusted proxy the real hop is the one nginx appended last, so a
    // forged leading entry is ignored in both directions.
    expect(await isRequestAllowed(request({ 'x-forwarded-for': '203.0.113.5' }))).toBe(false)
    expect(await isRequestAllowed(request({ 'x-forwarded-for': '10.1.2.3, 203.0.113.5' }))).toBe(false)
    expect(await isRequestAllowed(request({ 'x-forwarded-for': '203.0.113.5, 10.1.2.3' }))).toBe(true)
  })

  it('answers 403 for a blocked caller and leaves 401 semantics alone', async () => {
    const f = await resetFixtures().then(() => seedTwoUsersWithProjects())
    await setIpAllowlist(['10.0.0.0/8'], f.admin)
    invalidateAllowlistCache()

    const { token } = await createApiKey(f.alice, 'ip-check')
    const blocked = await withAudit(request({ 'x-forwarded-for': '203.0.113.5' }), 'project.list', async () => {
      throw new Error('must not run')
    })
    expect(blocked!.status).toBe(403)

    await setIpAllowlist([], f.admin)
    invalidateAllowlistCache()
    expect(await getCachedAllowlist()).toEqual([])

    const anonymous = await withAudit(request({ authorization: 'Bearer nope' }), 'project.list', async () => {
      throw new Error('must not run')
    })
    expect(anonymous!.status).toBe(401)
    expect(token).toMatch(/^mimir_/)
  })

  it('knows the proxy it trusts', () => {
    expect(getConfig().trustedProxies).toContain('127.0.0.1')
  })
})
