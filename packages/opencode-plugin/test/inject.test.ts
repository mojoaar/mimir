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
  callTool: async (
    name: string,
    args: Record<string, unknown>,
    options?: { timeoutMs?: number },
  ) => {
    mocks.calls.push({ name, args, options })
    if (mocks.reject) throw new Error('network is down')
    return mocks.result
  },
}))

import { MimirPlugin } from '../src/index.js'

const original = { url: process.env.MIMIR_URL, token: process.env.MIMIR_TOKEN }
async function fresh() {
  process.env.MIMIR_URL = 'http://127.0.0.1:3000'
  process.env.MIMIR_TOKEN = 'mimir_test'
  // The plugin remembers what it injected per session module-wide, so each
  // test starts from a clean module rather than from another test's memory.
  vi.resetModules()
  const { MimirPlugin: Fresh } = await import('../src/index.js')
  const hooks = await Fresh({ directory: '/tmp/project' } as never)
  const hook = hooks['experimental.chat.system.transform']
  if (!hook) throw new Error('the plugin registers no system transform hook')
  return hook
}

async function transform(sessionId = 'session-1') {
  const hook = await fresh()
  const output = { system: [] as string[] }
  await hook({ sessionID: sessionId } as never, output)
  return output
}

describe('the session-start digest', () => {
  it('adds what the project knows to the system prompt', async () => {
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { text: '### auth\n- rotation — tokens last 30 days' } }
    mocks.reject = false

    const output = await transform()

    expect(output.system).toHaveLength(1)
    expect(output.system[0]).toContain('What this project already knows')
    expect(output.system[0]).toContain('tokens last 30 days')
    expect(mocks.calls[0]?.name).toBe('memory_digest')
    expect(mocks.calls[0]?.args.repo).toBe('git@github.com:alice/notes.git')
  })

  it('asks for the digest with a budget and a short timeout', async () => {
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { text: 'anything' } }
    mocks.reject = false

    await transform()

    expect(mocks.calls[0]?.options?.timeoutMs).toBe(1500)
    expect(mocks.calls[0]?.args.budget_tokens).toBe(800)
  })

  it('says nothing when Mimir cannot answer', async () => {
    mocks.calls.length = 0
    mocks.result = { ok: false, error: 'mimir responded 500' }
    mocks.reject = false

    const output = await transform()

    expect(output.system).toHaveLength(0)
  })

  it('stays quiet when the call throws', async () => {
    mocks.calls.length = 0
    mocks.reject = true

    const output = await transform()

    expect(output.system).toHaveLength(0)
  })

  it('does not call Mimir when the environment is not configured', async () => {
    mocks.calls.length = 0
    mocks.reject = false
    delete process.env.MIMIR_URL
    process.env.MIMIR_TOKEN = 'mimir_test'

    const hooks = await MimirPlugin({ directory: '/tmp/project' } as never)
    const output = { system: [] as string[] }
    await hooks['experimental.chat.system.transform']?.({} as never, output)

    expect(mocks.calls).toHaveLength(0)
    expect(output.system).toHaveLength(0)
  })

  it('does nothing when the digest is empty', async () => {
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { text: '   ' } }
    mocks.reject = false

    const output = await transform()

    expect(output.system).toHaveLength(0)
  })

  it('injects once per session, however many steps the agent takes', async () => {
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { text: 'anything' } }
    mocks.reject = false
    const hook = await fresh()

    const first = { system: [] as string[] }
    const second = { system: [] as string[] }
    await hook({ sessionID: 'session-a' } as never, first)
    await hook({ sessionID: 'session-a' } as never, second)

    expect(mocks.calls).toHaveLength(1)
    expect(first.system).toHaveLength(1)
    expect(second.system).toHaveLength(0)
  })

  it('injects again for a different session', async () => {
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { text: 'anything' } }
    mocks.reject = false
    const hook = await fresh()

    await hook({ sessionID: 'session-a' } as never, { system: [] })
    await hook({ sessionID: 'session-b' } as never, { system: [] })

    expect(mocks.calls).toHaveLength(2)
  })

  it('restores the environment', () => {
    if (original.url === undefined) delete process.env.MIMIR_URL
    else process.env.MIMIR_URL = original.url
    if (original.token === undefined) delete process.env.MIMIR_TOKEN
    else process.env.MIMIR_TOKEN = original.token

    expect(true).toBe(true)
  })
})
