import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/seo', () => ({
  canonicalFor: async () => 'https://mimir.example.test',
}))

const { default: sitemap } = await import('./sitemap')

describe('the sitemap', () => {
  it('lists every docs page, including a group that is a page itself', async () => {
    const entries = await sitemap()

    expect(entries.map((entry) => entry.url)).toContain('https://mimir.example.test/docs/agents')
  })

  it('claims no modification date it cannot know', async () => {
    const entries = await sitemap()

    // Every URL used to say it changed just now, on every request.
    expect(entries.some((entry) => 'lastModified' in entry)).toBe(false)
  })
})
