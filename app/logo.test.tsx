import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Logo } from './logo'

describe('the mark', () => {
  it('is transparent, theme-inked and keeps the M', () => {
    const html = renderToStaticMarkup(<Logo className="h-6 w-6" />)

    expect(html).toContain('viewBox="0 0 512 512"')
    expect(html).toContain('text-[var(--logo-ink)]')
    expect(html).toContain('h-6 w-6')
    expect(html).toContain('mimir-logo-cut')
    expect(html).toContain('M192 310 V202')
    expect(html).toContain('aria-hidden="true"')
  })
})
