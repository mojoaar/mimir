import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  result: { ok: true, dim: 768 } as { ok: boolean; dim?: number; error?: string },
  audits: [] as Record<string, unknown>[],
}))

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/auth/context', () => ({ requireUser: async () => ({ id: 'u1' }) }))
vi.mock('@/lib/i18n/request', () => ({ translator: async () => (key: string) => key }))
vi.mock('@/lib/audit', () => ({
  audit: async (row: Record<string, unknown>) => {
    mocks.audits.push(row)
  },
}))
vi.mock('@/lib/providers/verify', () => ({ verifyProvider: async () => mocks.result }))
vi.mock('@/lib/providers/service', () => ({
  listProviders: async () => [{ id: 'p1', preset: 'octen', kind: 'embedding', label: 'octen' }],
  createProvider: async () => {},
  deleteProvider: async () => {},
  setDefaultProvider: async () => {},
  setProviderPrices: async () => {},
}))

import { verifyProviderAction } from './actions'

function form(id: string) {
  const data = new FormData()
  data.set('id', id)
  return data
}

describe('testing a provider', () => {
  it('hands the outcome back so the button can print it', async () => {
    mocks.result = { ok: true, dim: 768 }

    expect(await verifyProviderAction(null, form('p1'))).toEqual({ ok: true, dim: 768 })
    expect(mocks.audits[0]).toMatchObject({ action: 'provider.verify', targetId: 'p1' })
  })

  it('hands back the provider error', async () => {
    mocks.result = { ok: false, error: 'provider responded 401' }

    expect(await verifyProviderAction(null, form('p1'))).toEqual({
      ok: false,
      error: 'provider responded 401',
    })
  })
})
