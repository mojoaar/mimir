import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  calls: [] as { name: string; args: Record<string, unknown>; options?: { timeoutMs?: number } }[],
  result: { ok: true, result: { text: '### auth\n- rotation — tokens last 30 days' } } as
    | { ok: true; result: unknown }
    | { ok: false; error: string },
  reject: false,
  repo: 'git@github.com:alice/notes.git' as string | null,
}))

vi.mock('../src/client.js', () => ({
  detectRepo: () => mocks.repo,
  callTool: async (name: string, args: Record<string, unknown>, options?: { timeoutMs?: number }) => {
    mocks.calls.push({ name, args, options })
    if (mocks.reject) throw new Error('network is down')
    return mocks.result
  },
}))

import plugin from '../src/index.js'

type ContextEvent = {
  sessionID: string
  system: { type: string; text: string }[]
  messages?: unknown[]
}

function context(overrides: Record<string, unknown> = {}) {
  const hooks: Record<string, ((event: ContextEvent) => Promise<void>)[]> = {}
  const added: string[] = []
  const disposed: string[] = []
  const registration = (name: string) => ({ dispose: async () => void disposed.push(name) })

  const fake = {
    location: { directory: '/tmp/project' },
    options: { url: 'http://127.0.0.1:3000', token: 'mimir_test', ...overrides },
    session: {
      hook: async (name: string, callback: (event: ContextEvent) => Promise<void>) => {
        hooks[name] = [...(hooks[name] ?? []), callback]
        return registration(`session:${name}`)
      },
    },
    tool: {
      transform: async (callback: (editor: { add: (tool: { name: string }) => void }) => void) => {
        callback({ add: (tool) => added.push(tool.name) })
        return registration('tools')
      },
    },
    mcp: {
      transform: async (callback: (editor: { list: () => [] }) => void) => {
        callback({ list: () => [] })
        return registration('mcp')
      },
    },
  }
  return { fake, hooks, added, disposed }
}

async function setup(overrides: Record<string, unknown> = {}) {
  const built = context(overrides)
  const cleanup = await plugin.setup(built.fake as never)
  const [hook, nudge] = built.hooks.context ?? []
  if (!hook) throw new Error('the plugin registers no context hook')
  if (!nudge) throw new Error('the plugin registers no nudge hook')
  return { ...built, hook, nudge, cleanup }
}

function transform(sessionId = 'session-1', turns = 0) {
  const event: ContextEvent = {
    sessionID: sessionId,
    system: [],
    messages: Array.from({ length: turns }, () => ({})),
  }
  return event
}

describe('the session-start digest', () => {
  it('adds what the project knows to the system prompt', async () => {
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { text: '### auth\n- rotation — tokens last 30 days' } }
    mocks.reject = false
    const { hook } = await setup()

    const event = transform()
    await hook(event)

    expect(event.system).toHaveLength(1)
    expect(event.system[0]?.type).toBe('text')
    expect(event.system[0]?.text).toContain('What this project already knows')
    expect(event.system[0]?.text).toContain('tokens last 30 days')
    expect(mocks.calls[0]?.name).toBe('memory_digest')
    expect(mocks.calls[0]?.args.repo).toBe('git@github.com:alice/notes.git')
  })

  it('asks for the digest with a budget and a short timeout', async () => {
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { text: 'anything' } }
    mocks.reject = false
    const { hook } = await setup()

    await hook(transform())

    expect(mocks.calls[0]?.options?.timeoutMs).toBe(1500)
    expect(mocks.calls[0]?.args.budget_tokens).toBe(800)
  })

  it('injects once per session and again for a new one', async () => {
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { text: 'anything' } }
    mocks.reject = false
    const { hook } = await setup()

    const first = transform('session-a')
    const second = transform('session-a')
    const other = transform('session-b')
    await hook(first)
    await hook(second)
    await hook(other)

    expect(mocks.calls).toHaveLength(2)
    expect(first.system).toHaveLength(1)
    expect(second.system).toHaveLength(0)
    expect(other.system).toHaveLength(1)
  })

  it('says nothing when Mimir cannot answer', async () => {
    mocks.calls.length = 0
    mocks.result = { ok: false, error: 'mimir responded 500' }
    mocks.reject = false
    const { hook } = await setup()

    const event = transform()
    await hook(event)

    expect(event.system).toHaveLength(0)
  })

  it('stays quiet when the call throws', async () => {
    mocks.calls.length = 0
    mocks.reject = true
    const { hook } = await setup()

    const event = transform()
    await hook(event)

    expect(event.system).toHaveLength(0)
  })

  it('tries only once per session when the call fails', async () => {
    mocks.calls.length = 0
    mocks.result = { ok: false, error: 'mimir responded 500' }
    mocks.reject = false
    const { hook } = await setup()

    await hook(transform('session-a'))
    await hook(transform('session-a'))

    expect(mocks.calls).toHaveLength(1)
  })

  it('keys a folder without a git remote by its path', async () => {
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { text: 'anything' } }
    mocks.repo = null
    const { hook } = await setup()

    await hook(transform())

    expect(mocks.calls[0]?.args.repo).toBe('/tmp/project')
  })

  it('does nothing when the digest is empty', async () => {
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { text: '   ' } }
    mocks.reject = false
    const { hook } = await setup()

    const event = transform()
    await hook(event)

    expect(event.system).toHaveLength(0)
  })

  it('registers no hook at all when it is not configured', async () => {
    mocks.calls.length = 0
    const built = context({ url: '', token: '', tokenFile: '/nonexistent/mimir-token' })

    const cleanup = await plugin.setup(built.fake as never)

    expect(Object.keys(built.hooks)).toHaveLength(0)
    expect(built.added).toHaveLength(0)
    expect(cleanup).toBeUndefined()
  })

  it('disposes what it registered', async () => {
    const { cleanup, disposed } = await setup()

    await cleanup?.()

    // The MCP probe is disposed during setup; the two live registrations last
    // until the plugin is cleaned up.
    expect(disposed).toEqual(['mcp', 'tools', 'session:context', 'session:context'])
  })
})

describe('the nudge to write', () => {
  it('stays quiet while the session is short', async () => {
    const { nudge } = await setup()

    const event = transform('s', 10)
    await nudge(event)

    expect(event.system).toHaveLength(0)
  })

  it('reminds once the session passes twenty turns', async () => {
    const { nudge } = await setup()

    const event = transform('s', 20)
    await nudge(event)

    expect(event.system[0]?.text).toContain('Memory check')
    expect(event.system[0]?.text).toContain('memory_write')
  })

  it('does not repeat inside the next window', async () => {
    const { nudge } = await setup()

    await nudge(transform('s', 20))
    const quiet = transform('s', 35)
    await nudge(quiet)

    expect(quiet.system).toHaveLength(0)
  })

  it('reminds again when a compaction shrinks the transcript', async () => {
    const { nudge } = await setup()

    await nudge(transform('s', 20))
    const compacted = transform('s', 4)
    await nudge(compacted)

    expect(compacted.system[0]?.text).toContain('Memory check')
  })

  it('counts each session on its own', async () => {
    const { nudge } = await setup()

    await nudge(transform('a', 20))
    const other = transform('b', 5)
    await nudge(other)

    expect(other.system).toHaveLength(0)
  })
})
