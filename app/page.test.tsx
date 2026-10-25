import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import Home from './page'

// The landing page reads the theme cookie; outside a request there is no cookie
// store, so the test supplies an empty one and gets the default theme.
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}))

describe('landing page', () => {
  it('says what the product is and offers a way in', async () => {
    const html = renderToStaticMarkup(await Home())

    expect(html).toContain('Mimir')
    expect(html).toContain('Long-term memory')
    expect(html).toContain('href="/login"')
  })
})
