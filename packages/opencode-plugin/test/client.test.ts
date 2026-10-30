import { describe, expect, it, vi } from 'vitest'
import { callTool, detectRepo } from '../src/client'

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const ok = { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: '{"text":"hi"}' }] } }

describe('callTool', () => {
  it('posts one tools/call with the bearer token', async () => {
    const fetch = vi.fn(async () => response(ok))
    const result = await callTool('memory_digest', { repo: 'a/b' }, {
      url: 'https://m.test/',
      token: 'k',
      fetch: fetch as unknown as typeof fetch,
    })

    expect(result).toEqual({ ok: true, result: { text: 'hi' } })
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://m.test/mcp')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer k')
    expect(JSON.parse(String(init.body))).toMatchObject({
      method: 'tools/call',
      params: { name: 'memory_digest', arguments: { repo: 'a/b' } },
    })
  })

  it('fails without configuration and never throws', async () => {
    const result = await callTool('memory_digest', {}, { url: '', token: '' })
    expect(result).toEqual({ ok: false, error: 'set MIMIR_URL and MIMIR_TOKEN' })
  })

  it('names only the variable that is missing', async () => {
    const result = await callTool('memory_digest', {}, { url: 'http://127.0.0.1:3000', token: '' })
    expect(result).toEqual({ ok: false, error: 'set MIMIR_TOKEN' })
  })

  it('reports a non-2xx without echoing the body', async () => {
    const fetch = vi.fn(async () => response({ secret: 'sk-live-x' }, 401))
    const result = await callTool('memory_digest', {}, {
      url: 'https://m.test',
      token: 'k',
      fetch: fetch as unknown as typeof fetch,
    })

    expect(result).toEqual({ ok: false, error: 'mimir responded 401' })
  })

  it('surfaces a json-rpc error message', async () => {
    const fetch = vi.fn(async () => response({ jsonrpc: '2.0', id: 1, error: { message: 'bad args' } }))
    const result = await callTool('memory_write', {}, {
      url: 'https://m.test',
      token: 'k',
      fetch: fetch as unknown as typeof fetch,
    })

    expect(result).toEqual({ ok: false, error: 'bad args' })
  })

  it('turns a thrown fetch into a result', async () => {
    const fetch = vi.fn(async () => {
      throw new Error('boom')
    })
    const result = await callTool('memory_digest', {}, {
      url: 'https://m.test',
      token: 'k',
      fetch: fetch as unknown as typeof fetch,
    })

    expect(result).toEqual({ ok: false, error: 'boom' })
  })
})

describe('detectRepo', () => {
  it('reads the git remote under a real ESM import, not a require()', () => {
    // The package ships as ESM; a require() inside it returns null when OpenCode loads it.
    const repo = detectRepo(process.cwd())
    expect(repo).toMatch(/mojoaar\/mimir|^local:/)
  })
})
