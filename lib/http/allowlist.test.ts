import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ calls: 0, list: [] as string[] }))

vi.mock('@/lib/settings/security', () => ({
  getIpAllowlist: async () => {
    state.calls += 1
    return state.list
  },
}))

const { getCachedAllowlist, invalidateAllowlistCache, isAllowedIp } = await import('./allowlist')

describe('isAllowedIp', () => {
  it('allows everything when the list is empty', () => {
    expect(isAllowedIp(null, [])).toBe(true)
    expect(isAllowedIp('203.0.113.9', [])).toBe(true)
  })

  it('denies an unknown address when the list has entries', () => {
    expect(isAllowedIp(null, ['10.0.0.0/8'])).toBe(false)
    expect(isAllowedIp('203.0.113.9', ['10.0.0.0/8'])).toBe(false)
  })

  it('allows an address inside the list, including IPv6', () => {
    expect(isAllowedIp('10.4.4.4', ['10.0.0.0/8'])).toBe(true)
    expect(isAllowedIp('::1', ['::1/128'])).toBe(true)
  })
})

describe('the allowlist cache', () => {
  beforeEach(() => {
    state.calls = 0
    state.list = ['10.0.0.0/8']
    invalidateAllowlistCache()
  })

  it('reads once for repeated calls inside the window', async () => {
    await getCachedAllowlist()
    await getCachedAllowlist()
    await getCachedAllowlist()
    expect(state.calls).toBe(1)
  })

  it('re-reads after invalidation', async () => {
    expect(await getCachedAllowlist()).toEqual(['10.0.0.0/8'])
    state.list = ['192.168.0.0/16']
    invalidateAllowlistCache()
    expect(await getCachedAllowlist()).toEqual(['192.168.0.0/16'])
    expect(state.calls).toBe(2)
  })
})
