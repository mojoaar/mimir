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

// The catalogue is a network call; only DeepSeek's fixed list is needed here.
vi.mock('@/lib/providers/models', () => ({
  availableModels: async (id: string, kind: string) =>
    id === 'deepseek' && kind === 'llm'
      ? [{ id: 'deepseek-flash' }, { id: 'deepseek-v4-pro', label: '$0.28 per 1M' }]
      : [],
}))

import { listProviders } from '@/lib/providers/service'
import ProvidersPage from './page'
import { ProviderForm, type ProviderFormLabels } from './provider-form'

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
        keyHint: '********1234',
        isDefault: true,
        lastVerifiedAt: null,
        lastError: null,
      },
    ])

    const html = renderToStaticMarkup(await ProvidersPage())

    expect(html).toContain('work')
    expect(html).toContain('********1234')
    expect(html).not.toContain('sk-')
  })

  it('offers the preset models in a dropdown', async () => {
    vi.mocked(listProviders).mockResolvedValue([])

    const html = renderToStaticMarkup(await ProvidersPage())

    expect(html).toContain('<select name="model"')
    expect(html).toContain('deepseek-v4-pro — $0.28 per 1M')
    // DeepSeek has one kind, so the kind is submitted without a picker.
    expect(html).toContain('<input type="hidden" name="kind" value="llm"/>')
  })

  it('keeps a text field when a preset has no catalogue', () => {
    const labels = Object.fromEntries(
      [
        'provider', 'kind', 'kindLlm', 'kindEmbedding', 'label', 'labelPlaceholder', 'model',
        'baseUrl', 'baseUrlHint', 'apiKey', 'apiKeyHint', 'makeDefault', 'save', 'saving', 'saved',
      ].map((key) => [key, key]),
    ) as ProviderFormLabels

    const html = renderToStaticMarkup(
      <ProviderForm labels={labels} models={{ deepseek: {}, ollama: {} } as never} />,
    )

    expect(html).toContain('name="model" value="deepseek-flash"')
    expect(html).not.toContain('<select name="model"')
  })
})
