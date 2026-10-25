import { describe, expect, it, vi } from 'vitest'

const site = vi.hoisted(() => ({ url: 'https://mimir.example.test', name: 'Mimir' }))

vi.mock('@/lib/settings/site', () => ({
  getPublicUrl: async () => site.url,
  getSiteSettings: async () => ({
    publicUrl: site.url,
    siteName: site.name,
    metaDescription: 'Long-term memory for your agents.',
  }),
}))

const { canonicalFor, publicMetadata } = await import('./seo')

describe('canonicalFor', () => {
  it('builds an absolute url for a path', async () => {
    expect(await canonicalFor('/da')).toBe('https://mimir.example.test/da')
  })

  it('returns the bare origin for the root', async () => {
    expect(await canonicalFor('/')).toBe('https://mimir.example.test')
  })

  it('stays absolute when the stored url is localhost', async () => {
    site.url = 'http://localhost:3000'
    expect(await canonicalFor('/docs')).toBe('http://localhost:3000/docs')
    site.url = 'https://mimir.example.test'
  })
})

describe('publicMetadata', () => {
  it('sets the canonical and every locale alternate when asked', async () => {
    const meta = await publicMetadata({
      title: 'Mimir',
      description: 'Long-term memory for your agents.',
      path: '/da',
      locales: true,
    })
    expect(meta.alternates?.canonical).toBe('https://mimir.example.test/da')
    expect(Object.keys(meta.alternates?.languages ?? {})).toEqual(
      expect.arrayContaining(['en', 'da', 'de', 'x-default']),
    )
    expect(meta.openGraph?.title).toBe('Mimir')
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image' })
  })

  it('leaves out locales that do not exist, so docs never advertise a 404', async () => {
    const meta = await publicMetadata({
      title: 'Tools',
      description: 'The Mimir tool reference.',
      path: '/docs/tools',
    })
    expect(meta.alternates?.canonical).toBe('https://mimir.example.test/docs/tools')
    expect(meta.alternates?.languages).toBeUndefined()
  })
})
