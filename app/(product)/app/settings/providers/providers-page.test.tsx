import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/context', () => ({
  requireUser: async () => ({
    id: 'u1',
    email: 'alice@example.test',
    name: 'Alice',
    role: 'user',
    status: 'active',
    mfaEnabled: false,
  }),
}))

vi.mock('@/lib/providers/service', () => ({ listProviders: vi.fn() }))

import { listProviders } from '@/lib/providers/service'
import ProvidersPage from './page'

describe('providers page', () => {
  it('lists a saved provider without its key', async () => {
    vi.mocked(listProviders).mockResolvedValue([
      {
        id: 'p1',
        kind: 'llm',
        preset: 'deepseek',
        label: 'work',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        dim: null,
        hasKey: true,
        keyHint: '…alue',
        isDefault: true,
        lastVerifiedAt: null,
        lastError: null,
      },
    ])

    const html = renderToStaticMarkup(await ProvidersPage())

    expect(html).toContain('work')
    expect(html).toContain('…alue')
    expect(html).not.toContain('sk-')
  })
})
