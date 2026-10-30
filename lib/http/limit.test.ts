import { describe, expect, it } from 'vitest'
import { MAX_REQUEST_BYTES, readJson, rejectOversized } from './limit'

const withLength = (value?: string) =>
  ({ headers: new Headers(value === undefined ? {} : { 'content-length': value }) })

describe('rejectOversized', () => {
  it('refuses a declared body above the ceiling before it is parsed', () => {
    const response = rejectOversized(withLength(String(MAX_REQUEST_BYTES + 1)))
    expect(response?.status).toBe(413)
  })

  it('allows a body at the ceiling', () => {
    expect(rejectOversized(withLength(String(MAX_REQUEST_BYTES)))).toBeNull()
  })

  it('allows a request with no declared length', () => {
    expect(rejectOversized(withLength())).toBeNull()
  })
})

describe('readJson', () => {
  it('refuses a stream that declares no length', async () => {
    const huge = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('{ "a": "' + 'x'.repeat(70_000) + '" }'))
        c.close()
      },
    })
    const request = new Request('http://x/mcp', {
      method: 'POST',
      body: huge,
      duplex: 'half',
    } as RequestInit)

    await expect(readJson(request, 1024)).rejects.toMatchObject({ code: 'body_too_large' })
  })

  it('parses a body inside the cap', async () => {
    const request = new Request('http://x/mcp', {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
    })
    expect(await readJson<{ a: number }>(request)).toEqual({ a: 1 })
  })
})
