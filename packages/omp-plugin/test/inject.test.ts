import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  calls: [] as { name: string; args: Record<string, unknown> }[],
  result: { ok: true, result: { text: '### auth\n- tokens last 30 days' } } as
    | { ok: true; result: unknown }
    | { ok: false; error: string },
  repo: 'git@github.com:alice/notes.git' as string | null,
}))

vi.mock('../src/client.js', () => ({
  resolveConfig: () => ({ url: 'http://127.0.0.1:3000', token: 'mimir_test' }),
  detectRepo: () => mocks.repo,
  callTool: async (name: string, args: Record<string, unknown>) => {
    mocks.calls.push({ name, args })
    return mocks.result
  },
}))

import mimir, { DIGEST_HEADER, NUDGE_HEADER } from '../src/index.js'

type Message = Record<string, unknown>
type Tool = {
  name: string
  approval?: string
  description: string
  execute: (
    id: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
    update?: unknown,
    ctx?: { cwd: string },
  ) => Promise<{ content: { type: string; text: string }[] }>
}

/** The smallest ExtensionAPI the plugin touches, shaped like the real one. */
function fake() {
  const handlers: Record<string, ((event: unknown, ctx: { cwd: string }) => Promise<unknown>)[]> = {}
  const tools: Tool[] = []
  const schema = {
    describe: () => schema,
    optional: () => schema,
  }
  const pi = {
    zod: { object: (shape: Record<string, unknown>) => ({ shape }), string: () => schema },
    on: (event: string, handler: (event: unknown, ctx: { cwd: string }) => Promise<unknown>) => {
      handlers[event] = [...(handlers[event] ?? []), handler]
    },
    registerTool: (tool: Tool) => void tools.push(tool),
  }
  return { pi, handlers, tools }
}

const ctx = { cwd: '/tmp/project' }

async function setup() {
  const built = fake()
  mimir(built.pi as never)
  const context = built.handlers.context?.[0]
  if (!context) throw new Error('the plugin registered no context handler')
  return { ...built, context }
}

function event(count: number) {
  return { type: 'context', messages: Array.from({ length: count }, (_, i) => ({ role: 'user', i })) as Message[] }
}

function texts(result: unknown): string[] {
  const messages = (result as { messages?: { content?: string }[] } | undefined)?.messages ?? []
  return messages.map((message) => String(message.content ?? ''))
}

describe('the digest in front of the first call', () => {
  it('puts what the project knows into the first model call', async () => {
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { text: '### auth\n- tokens last 30 days' } }
    const { context } = await setup()

    const result = await context(event(1), ctx)

    expect(texts(result).some((text) => text.startsWith(DIGEST_HEADER))).toBe(true)
    expect(texts(result).join('\n')).toContain('tokens last 30 days')
    expect(mocks.calls[0]?.name).toBe('memory_digest')
    expect(mocks.calls[0]?.args.repo).toBe('git@github.com:alice/notes.git')
  })

  it('asks Mimir once per session, not before every model call', async () => {
    mocks.calls.length = 0
    const { context } = await setup()

    await context(event(1), ctx)
    const second = await context(event(4), ctx)

    expect(mocks.calls).toHaveLength(1)
    expect(second).toBeUndefined()
  })

  it('asks again after a compaction, which throws the digest away', async () => {
    mocks.calls.length = 0
    const { context, handlers } = await setup()

    await context(event(1), ctx)
    await handlers.session_compact?.[0]?.({}, ctx)
    const after = await context(event(3), ctx)

    expect(mocks.calls).toHaveLength(2)
    expect(texts(after).some((text) => text.startsWith(DIGEST_HEADER))).toBe(true)
  })

  it('says nothing when Mimir is down', async () => {
    mocks.result = { ok: false, error: 'connect ECONNREFUSED' }
    const { context } = await setup()

    const result = await context(event(1), ctx)

    expect(result).toBeUndefined()
  })
})

describe('the nudge to write', () => {
  it('stays quiet in a short session', async () => {
    const { context } = await setup()

    const result = await context(event(10), ctx)

    expect(texts(result).some((text) => text.startsWith(NUDGE_HEADER))).toBe(false)
  })

  it('fires at twenty messages', async () => {
    const { context } = await setup()

    const result = await context(event(20), ctx)

    expect(texts(result).some((text) => text.startsWith(NUDGE_HEADER))).toBe(true)
    expect(texts(result).join('\n')).toContain('mimir_remember')
  })

  it('does not repeat at thirty five', async () => {
    const { context } = await setup()

    await context(event(20), ctx)
    const result = await context(event(35), ctx)

    expect(texts(result).some((text) => text.startsWith(NUDGE_HEADER))).toBe(false)
  })

  it('fires again when the message list shrinks, which is a compaction', async () => {
    const { context } = await setup()

    await context(event(12), ctx)
    const result = await context(event(4), ctx)

    expect(texts(result).some((text) => text.startsWith(NUDGE_HEADER))).toBe(true)
  })
})

describe('the tools', () => {
  it('adds the four tools the OpenCode plugin has, with read tools marked read', async () => {
    const { tools } = await setup()

    expect(tools.map((tool) => tool.name)).toEqual([
      'mimir_digest',
      'mimir_remember',
      'mimir_search',
      'mimir_learn',
    ])
    expect(tools.find((tool) => tool.name === 'mimir_search')?.approval).toBe('read')
    expect(tools.find((tool) => tool.name === 'mimir_remember')?.approval).toBe('write')
  })

  it('writes a memory at the path it was given', async () => {
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { path: 'deploy/rollback', created: true } }
    const { tools } = await setup()
    const remember = tools.find((tool) => tool.name === 'mimir_remember')

    const result = await remember?.execute('1', { path: 'deploy/rollback', body: 'Redeploy the last image.' }, undefined, undefined, ctx)

    expect(result?.content[0]?.text).toBe('Stored deploy/rollback.')
    expect(mocks.calls[0]?.name).toBe('memory_write')
    expect(mocks.calls[0]?.args.body).toBe('Redeploy the last image.')
  })

  it('renders search hits as path and summary', async () => {
    mocks.result = {
      ok: true,
      result: [{ path: 'auth/tokens', title: 'Tokens', summary: 'They last 30 days.' }],
    }
    const { tools } = await setup()
    const search = tools.find((tool) => tool.name === 'mimir_search')

    const result = await search?.execute('1', { query: 'tokens' }, undefined, undefined, ctx)

    expect(result?.content[0]?.text).toBe('auth/tokens\nThey last 30 days.')
  })

  it('reports whether the learn job was queued', async () => {
    const { tools } = await setup()
    const learn = tools.find((tool) => tool.name === 'mimir_learn')

    mocks.result = { ok: true, result: { queued: true } }
    expect((await learn?.execute('1', { transcript: 'we chose x' }, undefined, undefined, ctx))?.content[0]?.text).toContain(
      'Queued',
    )

    mocks.result = { ok: true, result: { queued: false } }
    expect((await learn?.execute('1', { transcript: 'we chose x' }, undefined, undefined, ctx))?.content[0]?.text).toContain(
      'queue is not running',
    )
  })

  it('tells the agent to carry on when Mimir is unreachable', async () => {
    mocks.result = { ok: false, error: 'connect ECONNREFUSED' }
    const { tools } = await setup()
    const search = tools.find((tool) => tool.name === 'mimir_search')

    const result = await search?.execute('1', { query: 'tokens' }, undefined, undefined, ctx)

    expect(result?.content[0]?.text).toContain('Mimir is unavailable')
  })
})

describe('the transcript it hands over', () => {
  const long = (label: string) => ({ role: 'user', content: `${label} `.repeat(60) })

  it('sends the part that was compacted, once', async () => {
    const { handlers, context } = await setup()
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { queued: true } }

    const big = [long('one'), long('two'), long('three'), long('four'), long('five')]
    await context({ type: 'context', messages: big }, ctx)

    const [compact] = handlers.session_compact ?? []
    expect(compact).toBeDefined()
    await compact?.({}, ctx)
    await compact?.({}, ctx)

    const learn = mocks.calls.filter((call) => call.name === 'memory_learn')
    expect(learn).toHaveLength(1)
    expect(String(learn[0]?.args.transcript)).toContain('five')
    expect(learn[0]?.args.repo).toBe('git@github.com:alice/notes.git')
  })

  it('sends nothing when there is nothing to send', async () => {
    const { handlers } = await setup()
    mocks.calls.length = 0

    const [compact] = handlers.session_compact ?? []
    await compact?.({}, ctx)

    expect(mocks.calls.filter((call) => call.name === 'memory_learn')).toHaveLength(0)
  })

  it('survives a Mimir that is down', async () => {
    const { handlers, context } = await setup()
    mocks.calls.length = 0
    mocks.result = { ok: false, error: 'connect ECONNREFUSED' }

    await context({ type: 'context', messages: [long('x'), long('y')] }, ctx)
    const [compact] = handlers.session_compact ?? []
    await expect(compact?.({}, ctx)).resolves.toBeUndefined()

    mocks.result = { ok: true, result: { text: '### auth' } }
  })
})
