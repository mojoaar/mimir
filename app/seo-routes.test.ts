import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/settings/site', () => ({
  getPublicUrl: async () => 'https://mimir.example.test',
  getSiteSettings: async () => ({
    publicUrl: 'https://mimir.example.test',
    siteName: 'Mimir',
    metaDescription: 'Long-term memory for your agents.',
  }),
}))

const sitemap = (await import('./sitemap')).default
const robots = (await import('./robots')).default
const { DOCS_SLUGS } = await import('@/lib/docs/nav')

describe('sitemap', () => {
  it('lists every marketing locale and every docs page', async () => {
    const entries = await sitemap()
    const urls = entries.map((entry) => entry.url)
    expect(urls).toContain('https://mimir.example.test/da')
    expect(urls).toContain('https://mimir.example.test/de')
    for (const slug of DOCS_SLUGS) {
      expect(urls).toContain(`https://mimir.example.test${slug}`)
    }
    expect(urls.join(' ')).not.toContain('localhost')
  })

  it('gives marketing entries the three language alternates', async () => {
    const entries = await sitemap()
    const root = entries.find((entry) => entry.url === 'https://mimir.example.test')
    expect(Object.keys(root?.alternates?.languages ?? {})).toEqual(
      expect.arrayContaining(['en', 'da', 'de']),
    )
  })
})

describe('robots', () => {
  it('keeps private prefixes out and names the sitemap', async () => {
    const rules = await robots()
    const disallow = String(rules.rules && 'disallow' in rules.rules ? rules.rules.disallow : '')
    expect(disallow).toContain('/app')
    expect(disallow).toContain('/api')
    expect(String(rules.sitemap)).toBe('https://mimir.example.test/sitemap.xml')
  })
})
