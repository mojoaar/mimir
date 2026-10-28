import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { GET } from './route'

describe('the raw changelog', () => {
  it('serves the whole file, not a preview', async () => {
    const response = await GET()
    const body = await response.text()

    expect(response.headers.get('content-type')).toContain('text/markdown')
    expect(body).toBe(readFileSync(path.join(process.cwd(), 'CHANGELOG.md'), 'utf8'))
    // The oldest release is far past the 400 characters the docs page used to show.
    expect(body).toContain('## [0.1.0]')
  })
})
