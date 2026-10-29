import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { KeyToken, type KeyFormLabels } from './key-form'

const labels: KeyFormLabels = {
  name: 'Name',
  placeholder: 'laptop',
  create: 'Create key',
  creating: 'Creating…',
  copyNow: 'Copy this now - it is not shown again.',
  copy: 'Copy',
  copied: 'Copied',
}

describe('a freshly created key', () => {
  it('shows the key and a button to take it', () => {
    const html = renderToStaticMarkup(<KeyToken token="mimir_abc123" labels={labels} />)

    expect(html).toContain('mimir_abc123')
    expect(html).toContain('Copy this now')
    // A button rather than a link: there is nowhere to go, it writes the key
    // to the clipboard.
    expect(html).toContain('type="button"')
    expect(html).toContain('>Copy<')
  })

  it('keeps the key readable when the clipboard is refused', () => {
    const html = renderToStaticMarkup(<KeyToken token="mimir_abc123" labels={labels} />)

    // The code block is the fallback a denied clipboard leaves behind.
    expect(html).toContain('<code')
  })
})
