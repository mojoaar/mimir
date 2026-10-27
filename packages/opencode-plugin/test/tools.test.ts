import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  calls: [] as { name: string; args: Record<string, unknown>; options?: { timeoutMs?: number } }[],
  result: { ok: true, result: { text: 'the digest' } } as
    | { ok: true; result: unknown }
    | { ok: false; error: string },
  repo: 'git@github.com:alice/notes.git' as string | null,
}))

vi.mock('../src/client.js', () => ({
  detectRepo: () => mocks.repo,
  callTool: async (name: string, args: Record<string, unknown>, options?: { timeoutMs?: number }) => {
    mocks.calls.push({ name, args, options })
    return mocks.result
  },
}))

import { registerTools } from '../src/tools.js'

type Added = { name: string; input: any; execute: (input: any, context: any) => Promise<any> }
type Remote = { type: 'remote'; url: string }

function context(servers: Remote[] = []) {
  const added: Added[] = []
  const disposed: string[] = []
  const fake = {
    mcp: {
      transform: async (cb: (editor: unknown) => void) => {
        cb({ list: () => servers.map((s) => ['mimir', s]) })
        return { dispose: async () => void disposed.push('mcp') }
      },
    },
    tool: {
      transform: async (cb: (editor: unknown) => void) => {
        cb({ add: (tool: Added) => added.push(tool) })
        return { dispose: async () => void disposed.push('tools') }
      },
    },
  }
  return { fake, added, disposed }
}

const config = { url: 'http://127.0.0.1:3000', token: 't', tools: 'auto' as const }

describe('the plugin tools', () => {
  it('adds both tools when nothing else serves Mimir', async () => {
    mocks.calls.length = 0
    const { fake, added } = context()

    await registerTools(fake as never, config, mocks.repo)

    expect(added.map((t) => t.name)).toEqual(['mimir_digest', 'mimir_remember'])
    for (const tool of added) expect(tool.input.type).toBe('object')
  })

  it('leaves them out when an MCP server already points at the same endpoint', async () => {
    mocks.calls.length = 0
    const { fake, added, disposed } = context([{ type: 'remote', url: 'http://127.0.0.1:3000/mcp' }])

    await registerTools(fake as never, config, mocks.repo)

    expect(added).toHaveLength(0)
    expect(disposed).toContain('mcp')
  })

  it('accepts the server url with a trailing slash', async () => {
    const { fake, added } = context([{ type: 'remote', url: 'http://127.0.0.1:3000/mcp/' }])
    await registerTools(fake as never, config, mocks.repo)
    expect(added).toHaveLength(0)
  })

  it('adds them when the matching server is disabled', async () => {
    const { fake, added } = context([])
    const disabled = {
      transform: async (cb: (editor: unknown) => void) => {
        cb({ list: () => [['mimir', { type: 'remote', url: 'http://127.0.0.1:3000/mcp', disabled: true }]] })
        return { dispose: async () => {} }
      },
    }
    await registerTools({ tool: fake.tool, mcp: disabled } as never, config, mocks.repo)
    expect(added).toHaveLength(2)
  })

  it('still adds them when the mcp probe throws', async () => {
    const { fake, added } = context([])
    const broken = { transform: async () => { throw new Error('mcp exploded') } }
    await registerTools({ tool: fake.tool, mcp: broken } as never, config, mocks.repo)
    expect(added).toHaveLength(2)
  })

  it('adds them anyway when the policy is always', async () => {
    const { fake, added } = context([{ type: 'remote', url: 'http://127.0.0.1:3000/mcp' }])
    await registerTools(fake as never, { ...config, tools: 'always' }, mocks.repo)
    expect(added).toHaveLength(2)
  })

  it('adds nothing when the policy is never', async () => {
    const { fake, added } = context()
    await registerTools(fake as never, { ...config, tools: 'never' }, mocks.repo)
    expect(added).toHaveLength(0)
  })

  it('asks for a short digest', async () => {
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { text: 'the digest' } }
    const { fake, added } = context()
    await registerTools(fake as never, config, mocks.repo)
    const digest = added.find((t) => t.name === 'mimir_digest')!

    const result = await digest.execute({}, {})

    expect(mocks.calls[0]).toEqual({
      name: 'memory_digest',
      args: { budget_tokens: 800, repo: 'git@github.com:alice/notes.git' },
      options: { timeoutMs: 5000 },
    })
    expect(result).toEqual({ content: 'the digest' })
  })

  it('passes a budget through', async () => {
    mocks.calls.length = 0
    const { fake, added } = context()
    await registerTools(fake as never, config, mocks.repo)
    await added.find((t) => t.name === 'mimir_digest')!.execute({ budget_tokens: 42 }, {})
    expect(mocks.calls[0]?.args.budget_tokens).toBe(42)
  })

  it('stores a memory and reports whether it was new', async () => {
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { path: 'deploy/rollback', created: false } }
    const { fake, added } = context()
    await registerTools(fake as never, config, mocks.repo)

    const result = await added
      .find((t) => t.name === 'mimir_remember')!
      .execute({ path: 'deploy/rollback', body: 'blue-green', kind: 'note' }, {})

    expect(mocks.calls[0]).toEqual({
      name: 'memory_write',
      args: { path: 'deploy/rollback', body: 'blue-green', kind: 'note', repo: 'git@github.com:alice/notes.git' },
      options: { timeoutMs: 8000 },
    })
    expect(result).toEqual({ content: 'Updated deploy/rollback.' })
  })

  it('says so instead of throwing when Mimir is down', async () => {
    mocks.calls.length = 0
    mocks.result = { ok: false, error: 'mimir responded 500' }
    const { fake, added } = context()
    await registerTools(fake as never, config, mocks.repo)

    const digest = await added.find((t) => t.name === 'mimir_digest')!.execute({}, {})
    const write = await added.find((t) => t.name === 'mimir_remember')!.execute({ path: 'p', body: 'b' }, {})

    expect(digest.content).toContain('Mimir is unavailable')
    expect(write.content).toContain('Could not store that')
  })
})
