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

type AddedCommand = {
  name: string
  description?: string
  execute: (input: { sessionID: string }) => Promise<void>
}

type AddedTool = {
  name: string
  description: string
  input: { properties: Record<string, { enum?: string[] }> }
  execute?: (input: Record<string, unknown>, context?: unknown) => Promise<{ content: string }>
}

function context(overrides: Record<string, unknown> = {}) {
  const hooks: Record<string, ((event: ContextEvent) => Promise<void>)[]> = {}
  const added: AddedTool[] = []
  const commands: AddedCommand[] = []
  const notices: string[] = []
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
      synthetic: async ({ text }: { text: string }) => void notices.push(text),
    },
    command: {
      transform: async (callback: (editor: { add: (command: AddedCommand) => void }) => void) => {
        callback({ add: (command) => commands.push(command) })
        return registration('commands')
      },
    },
    tool: {
      transform: async (callback: (editor: { add: (tool: AddedTool) => void }) => void) => {
        callback({ add: (tool) => added.push(tool) })
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
  return { fake, hooks, added, commands, notices, disposed }
}

async function setup(overrides: Record<string, unknown> = {}) {
  const built = context(overrides)
  const cleanup = await plugin.setup(built.fake as never)
  const [hook, nudge] = built.hooks.context ?? []
  const [compact] = built.hooks.compaction ?? []
  const [command] = built.commands
  if (!hook) throw new Error('the plugin registers no context hook')
  if (!nudge) throw new Error('the plugin registers no nudge hook')
  if (!compact) throw new Error('the plugin registers no compaction hook')
  if (!command) throw new Error('the plugin registers no command')
  return { ...built, hook, nudge, compact, command, cleanup }
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
    expect(disposed).toEqual(['mcp', 'tools', 'session:context', 'session:context', 'session:compaction', 'commands'])
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

describe('the tools it adds', () => {
  it('offers digest, write, search, read and learn', async () => {
    const { added } = await setup()

    expect(added.map((tool) => tool.name)).toEqual([
      'mimir_digest',
      'mimir_remember',
      'mimir_search',
      'mimir_read',
      'mimir_learn',
    ])
  })

  it('reads a body so a path from search can be opened', async () => {
    mocks.calls.length = 0
    mocks.reject = false
    mocks.repo = 'git@github.com:alice/notes.git'
    mocks.result = {
      ok: true,
      result: {
        path: 'deploy/rollback',
        title: 'Rollback',
        body: 'Redeploy the previous image.',
        updatedAt: '2026-10-30T07:12:00.000Z',
      },
    }
    const { added } = await setup()

    const read = added.find((tool) => tool.name === 'mimir_read')
    const out = await read?.execute?.({ path: 'deploy/rollback' })

    expect(mocks.calls[0]?.name).toBe('memory_read')
    expect(mocks.calls[0]?.args.path).toBe('deploy/rollback')
    expect(mocks.calls[0]?.args.repo).toBe('git@github.com:alice/notes.git')
    expect(out?.content).toContain('deploy/rollback · updated 2026-10-30')
    expect(out?.content).toContain('Redeploy the previous image.')
  })

  it('accepts every kind the server accepts', async () => {
    const { added } = await setup()

    const remember = added.find((tool) => tool.name === 'mimir_remember')
    expect(remember?.input.properties.kind?.enum).toEqual([
      'note',
      'fact',
      'decision',
      'gotcha',
      'procedure',
      'snippet',
      'import',
    ])
  })

  it('says when the write started a project of its own', async () => {
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { path: 'a/b', created: true, projectCreated: true } }
    const { added } = await setup()
    const remember = added.find((tool) => tool.name === 'mimir_remember')

    const out = await remember?.execute?.({ path: 'a/b', body: 'x' })

    expect(out?.content).toContain('If a teammate already uses this repository')
  })

  it('takes a title, so the memory does not inherit one from its first line', async () => {
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { path: 'deploy/rollback', created: true } }
    const { added } = await setup()
    const remember = added.find((tool) => tool.name === 'mimir_remember')

    expect(remember?.input.properties.title).toBeDefined()
    await remember?.execute?.({ path: 'deploy/rollback', body: 'Redeploy.', title: 'Roll back by redeploying' })

    expect(mocks.calls[0]?.args.title).toBe('Roll back by redeploying')
  })

  it('searches with the prefix and the repo', async () => {
    mocks.calls.length = 0
    mocks.repo = 'git@github.com:alice/notes.git'
    mocks.result = { ok: true, result: [{ path: 'auth/mfa', title: 'MFA', summary: 'TOTP only.' }] }
    mocks.reject = false
    const { added } = await setup()

    const search = added.find((tool) => tool.name === 'mimir_search')
    const out = await search?.execute?.({ query: 'mfa', path_prefix: 'auth' })

    expect(mocks.calls[0]?.name).toBe('memory_search')
    expect(mocks.calls[0]?.args.path_prefix).toBe('auth')
    expect(mocks.calls[0]?.args.repo).toBe('git@github.com:alice/notes.git')
    expect(out?.content).toContain('auth/mfa')
    expect(out?.content).toContain('TOTP only.')
  })

  it('hands a session over and reports the queue', async () => {
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { queued: true } }
    mocks.reject = false
    const { added } = await setup()

    const learn = added.find((tool) => tool.name === 'mimir_learn')
    const out = await learn?.execute?.({ transcript: 'we settled on short-lived tokens' })

    expect(mocks.calls[0]?.name).toBe('memory_learn')
    expect(mocks.calls[0]?.args.transcript).toBe('we settled on short-lived tokens')
    expect(out?.content).toContain('Queued')
  })

  it('tells Mimir which session is writing', async () => {
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { path: 'a/one', created: true } }
    mocks.reject = false
    const { added } = await setup()

    const remember = added.find((tool) => tool.name === 'mimir_remember')
    await remember?.execute?.({ path: 'a/one', body: 'one' }, { sessionID: 'ses_abc' })

    expect(mocks.calls[0]?.name).toBe('memory_write')
    expect(mocks.calls[0]?.args.client).toBe('opencode')
    expect(mocks.calls[0]?.args.session).toBe('ses_abc')
  })

  it('names the client when it hands a session over', async () => {
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { queued: true } }
    mocks.reject = false
    const { added } = await setup()

    const learn = added.find((tool) => tool.name === 'mimir_learn')
    await learn?.execute?.({ transcript: 'a settled thing' }, { sessionID: 'ses_abc' })

    expect(mocks.calls[0]?.args.client).toBe('opencode')
    expect(mocks.calls[0]?.args.session).toBe('ses_abc')
  })

  it('says so when the queue is not running', async () => {
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { queued: false } }
    const { added } = await setup()

    const learn = added.find((tool) => tool.name === 'mimir_learn')
    const out = await learn?.execute?.({ transcript: 'anything' })

    expect(out?.content).toContain('queue is not running')
  })

  it('says why nothing will be written, instead of queueing', async () => {
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { queued: false, reason: 'learning is off for this project' } }
    const { added } = await setup()

    const learn = added.find((tool) => tool.name === 'mimir_learn')
    const out = await learn?.execute?.({ transcript: 'anything' })

    expect(out?.content).toContain('learning is off for this project')
  })

  it('fails soft when Mimir cannot answer', async () => {
    mocks.calls.length = 0
    mocks.result = { ok: false, error: 'mimir responded 500' }
    mocks.reject = false
    const { added } = await setup()

    const search = added.find((tool) => tool.name === 'mimir_search')
    const learn = added.find((tool) => tool.name === 'mimir_learn')

    expect((await search?.execute?.({ query: 'x' }))?.content).toContain('Mimir is unavailable')
    expect((await learn?.execute?.({ transcript: 'x' }))?.content).toContain('Could not hand that over')
  })
})

describe('the transcript it hands over', () => {
  const long = (label: string) => ({ role: 'user', content: `${label} `.repeat(60) })

  it('sends the messages OpenCode is about to compact', async () => {
    const { compact } = await setup()
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { queued: true } }

    await compact({ sessionID: 's1', system: [], messages: [long('one'), long('five')] })

    const learn = mocks.calls.filter((call) => call.name === 'memory_learn')
    expect(learn).toHaveLength(1)
    expect(String(learn[0]?.args.transcript)).toContain('five')
    expect(learn[0]?.args.repo).toBe('git@github.com:alice/notes.git')
    expect(learn[0]?.options?.timeoutMs).toBe(4000)
  })

  it('leaves the compaction prompt alone', async () => {
    const { compact } = await setup()
    mocks.result = { ok: true, result: { queued: true } }
    const event = { sessionID: 's1', system: [] as { type: string; text: string }[], messages: [long('a')] }

    await compact(event)

    expect(event.system).toHaveLength(0)
  })

  it('sends once for a compaction that asks twice', async () => {
    const { compact } = await setup()
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { queued: true } }
    const event = { sessionID: 's2', system: [], messages: [long('a'.repeat(60))] }

    await compact(event)
    await compact(event)

    expect(mocks.calls.filter((call) => call.name === 'memory_learn')).toHaveLength(1)
  })

  it('names the session the compaction came from', async () => {
    const { compact } = await setup()
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { queued: true } }
    mocks.reject = false

    // Two labels so the transcript clears the 500 character floor.
    await compact({ sessionID: 's2b', system: [], messages: [long('alpha'), long('beta')] })

    expect(mocks.calls[0]?.args.client).toBe('opencode')
    expect(mocks.calls[0]?.args.session).toBe('s2b')
  })

  it('sends nothing when the compacted part has no text', async () => {
    const { compact } = await setup()
    mocks.calls.length = 0

    await compact({ sessionID: 's3', system: [], messages: [{}, {}] })

    expect(mocks.calls.filter((call) => call.name === 'memory_learn')).toHaveLength(0)
  })

  it('survives a Mimir that is down', async () => {
    const { compact } = await setup()
    mocks.calls.length = 0
    mocks.reject = true

    await expect(compact({ sessionID: 's4', system: [], messages: [long('x')] })).resolves.toBeUndefined()

    mocks.reject = false
  })

  it('does not treat a shorter list as a compaction', async () => {
    const { nudge } = await setup()
    mocks.calls.length = 0

    const big = [long('one'), long('two'), long('three')]
    await nudge({ sessionID: 's5', system: [], messages: big })
    await nudge({ sessionID: 's5', system: [], messages: [big[0]] })

    expect(mocks.calls.filter((call) => call.name === 'memory_learn')).toHaveLength(0)
  })

  it('cuts an oversized transcript to its tail', async () => {
    const { compact } = await setup()
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { queued: true } }

    await compact({ sessionID: 's6', system: [], messages: [long('x'.repeat(600))] })

    expect(mocks.calls[0]?.name).toBe('memory_learn')
    expect(String(mocks.calls[0]?.args.transcript).length).toBe(32_000)
  })
})

describe('the command to hand it over now', () => {
  // Two of these clear the 500 character floor with room to spare.
  const long = (label: string) => ({ role: 'user', content: `${label} `.repeat(80) })

  it('sends the session the command was typed in', async () => {
    const { nudge, command, notices } = await setup()
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { queued: true } }

    await nudge({ sessionID: 'c1', system: [], messages: [long('one'), long('two')] })
    await command.execute({ sessionID: 'c1' })

    const learn = mocks.calls.filter((call) => call.name === 'memory_learn')
    expect(learn).toHaveLength(1)
    expect(String(learn[0]?.args.transcript)).toContain('two')
    expect(learn[0]?.args.repo).toBe('git@github.com:alice/notes.git')
    expect(notices[0]).toContain('Mimir is writing')
  })

  it('says so when there is nothing worth sending', async () => {
    const { command, notices } = await setup()
    mocks.calls.length = 0

    await command.execute({ sessionID: 'c2' })

    expect(mocks.calls.filter((call) => call.name === 'memory_learn')).toHaveLength(0)
    expect(notices[0]).toContain('Nothing worth handing over')
  })

  it('reports an unreachable Mimir instead of throwing', async () => {
    const { nudge, command, notices } = await setup()
    mocks.calls.length = 0
    mocks.reject = true

    await nudge({ sessionID: 'c3', system: [], messages: [long('alpha'), long('beta')] })
    await expect(command.execute({ sessionID: 'c3' })).resolves.toBeUndefined()

    mocks.reject = false
    expect(notices[0]).toContain('unreachable')
  })

  it('names the session the command came from', async () => {
    const { nudge, command } = await setup()
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { queued: true } }
    mocks.reject = false

    await nudge({ sessionID: 'c5', system: [], messages: [long('alpha'), long('beta')] })
    await command.execute({ sessionID: 'c5' })

    expect(mocks.calls[0]?.args.client).toBe('opencode')
    expect(mocks.calls[0]?.args.session).toBe('c5')
  })

  it('does not send the same session twice', async () => {
    const { nudge, command } = await setup()
    mocks.calls.length = 0
    mocks.result = { ok: true, result: { queued: true } }
    mocks.reject = false

    await nudge({ sessionID: 'c4', system: [], messages: [long('xray'), long('yankee')] })
    await command.execute({ sessionID: 'c4' })
    await command.execute({ sessionID: 'c4' })

    expect(mocks.calls.filter((call) => call.name === 'memory_learn')).toHaveLength(1)
  })
})
