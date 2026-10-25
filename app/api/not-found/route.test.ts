import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { GET, missingPage } from './route'

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    headers: cookie ? { cookie } : {},
  })
}

describe('the 404 page', () => {
  it('answers 404 with html', async () => {
    const response = await GET(request('/nope'))
    const body = await response.text()

    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(body).toContain('Mimir looked. Nothing came back.')
    expect(body).toContain('/nope')
  })

  it('paints the theme the visitor chose, and the default for junk', async () => {
    expect(await (await GET(request('/x', 'mimir_theme=fjord-light'))).text()).toContain('#dbe3ea')
    expect(await (await GET(request('/x', 'mimir_theme=<script>'))).text()).toContain('#0b1020')
  })

  it('keeps the same joke for the same path', () => {
    expect(missingPage('/a/b', 'nordlys-dark')).toBe(missingPage('/a/b', 'nordlys-dark'))
  })

  it('does not let a crafted path inject markup', async () => {
    const body = await (await GET(request('/<script>alert(1)</script>'))).text()

    expect(body).not.toContain('<script>alert(1)</script>')
    expect(body).toContain('alert(1)')
  })
})
