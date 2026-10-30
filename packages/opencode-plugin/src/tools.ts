import { callTool } from './client.js'
import type { MimirConfig } from './config.js'

export type Registration = { dispose: () => Promise<void> }

type ToolInput = Record<string, unknown>
type ToolContext = { sessionID?: string } | undefined
type ToolExecutor = (input: unknown, context: ToolContext) => Promise<{ content: string }>
type ToolDefinition = {
  name: string
  description: string
  input: Record<string, unknown>
  execute: ToolExecutor
}

type ToolsContext = {
  tool: { transform: (callback: (editor: { add: (tool: ToolDefinition) => void }) => void) => Promise<Registration> }
  mcp: {
    transform: (
      callback: (editor: { list: () => readonly [string, { type?: string; url?: string; disabled?: boolean }][] }) => void,
    ) => Promise<Registration>
  }
}

/**
 * The two tools exist for someone running the plugin without the MCP server.
 * When an MCP server already answers at the same endpoint they would only
 * duplicate its tools, so `auto` leaves them out.
 */
export async function registerTools(
  ctx: ToolsContext,
  config: MimirConfig,
  repo: string | null,
): Promise<Registration> {
  if (config.tools === 'never') return IDLE
  if (config.tools === 'auto' && (await servedByMcp(ctx, config.url))) return IDLE

  return ctx.tool.transform((editor) => {
    editor.add(digestTool(repo, config))
    editor.add(rememberTool(repo, config))
    editor.add(searchTool(repo, config))
    editor.add(readTool(repo, config))
    editor.add(learnTool(repo, config))
  })
}

const IDLE: Registration = { dispose: async () => {} }

async function servedByMcp(ctx: ToolsContext, url: string): Promise<boolean> {
  let found = false
  try {
    const registration = await ctx.mcp.transform((editor) => {
      found = editor
        .list()
        .some(([, server]) => server.type === 'remote' && !server.disabled && sameEndpoint(server.url, `${url}/mcp`))
    })
    await registration.dispose()
  } catch {
    // A broken MCP entry must not cost the session its tools.
    return false
  }
  return found
}

function sameEndpoint(actual: string | undefined, expected: string): boolean {
  return strip(actual) === strip(expected)
}

function strip(value: string | undefined): string {
  return (value ?? '').replace(/\/+$/, '')
}

function digestTool(repo: string | null, config: MimirConfig): ToolDefinition {
  return {
    name: 'mimir_digest',
    description:
      'Load what this project already knows from Mimir. Call once at the start of a session, before searching for anything.',
    input: {
      type: 'object',
      properties: {
        budget_tokens: {
          type: 'integer',
          minimum: 1,
          description: 'Rough size cap, default 800',
        },
      },
      additionalProperties: false,
    },
    async execute(input) {
      const args = input as ToolInput
      const result = await callTool(
        'memory_digest',
        { budget_tokens: Number(args.budget_tokens ?? 800), repo: repo ?? undefined },
        { url: config.url, token: config.token, timeoutMs: 5000 },
      )
      if (!result.ok) return { content: `Mimir is unavailable (${result.error}). Carry on without it.` }
      const digest = result.result as { text?: string }
      return { content: digest.text?.trim() || 'Mimir has nothing stored for this project yet.' }
    },
  }
}

// A project created from a repo a teammate already knows about splits the
// knowledge in two until someone asks the owner for a grant.
const NEW_PROJECT = ' Started a new project. If a teammate already uses this repository, request access at /app/requests on your Mimir install.'

function rememberTool(repo: string | null, config: MimirConfig): ToolDefinition {
  return {
    name: 'mimir_remember',
    description:
      'Store one durable fact in Mimir. Use a path like "deploy/rollback" or "auth/token-rotation"; rewriting the same path replaces what was there.',
    input: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Slash-separated memory path, e.g. deploy/rollback' },
        body: { type: 'string', description: 'What to remember, written so it reads without the conversation' },
        title: { type: 'string', description: 'One line. Defaults to the first line of the body.' },
        kind: {
          type: 'string',
          enum: ['note', 'fact', 'decision', 'gotcha', 'procedure', 'snippet', 'import'],
        },
      },
      required: ['path', 'body'],
      additionalProperties: false,
    },
    // `client` and `session` are provenance, so history can say who wrote it.
    async execute(input, context) {
      const args = input as ToolInput
      const result = await callTool(
        'memory_write',
        {
          path: String(args.path ?? ''),
          body: String(args.body ?? ''),
          title: typeof args.title === 'string' ? args.title : undefined,
          kind: typeof args.kind === 'string' ? args.kind : undefined,
          repo: repo ?? undefined,
          client: 'opencode',
          session: context?.sessionID,
        },
        { url: config.url, token: config.token, timeoutMs: 8000 },
      )
      if (!result.ok) return { content: `Could not store that (${result.error}).` }
      const written = result.result as { path?: string; created?: boolean; projectCreated?: boolean }
      const note = written.projectCreated ? NEW_PROJECT : ''
      return {
        content: `${written.created ? 'Stored' : 'Updated'} ${written.path ?? String(args.path ?? '')}.${note}`,
      }
    },
  }
}

function searchTool(repo: string | null, config: MimirConfig): ToolDefinition {
  return {
    name: 'mimir_search',
    description:
      'Search what this project has already settled in Mimir. Returns paths, titles and summaries; read a path with the MCP server if you need the body.',
    input: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look for, in plain words' },
        path_prefix: { type: 'string', description: 'Scope to a directory, e.g. auth' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    async execute(input) {
      const args = input as ToolInput
      const result = await callTool(
        'memory_search',
        { query: typeof args.query === 'string' ? args.query : '', path_prefix: typeof args.path_prefix === 'string' ? args.path_prefix : undefined, repo: repo ?? undefined },
        { url: config.url, token: config.token, timeoutMs: 8000 },
      )
      if (!result.ok) return { content: `Mimir is unavailable (${result.error}). Carry on without it.` }
      const hits = result.result as { path: string; title: string; summary: string | null }[]
      if (!Array.isArray(hits) || hits.length === 0) return { content: 'Nothing matches that in Mimir.' }
      return {
        content: hits
          .map((hit) => `${hit.path}\n${hit.summary ?? hit.title}`)
          .join('\n\n'),
      }
    },
  }
}

/** The date is what tells a reader whether the body still holds. */
function renderMemory(memory: { path?: string; title?: string; body?: string; updatedAt?: string }): string {
  const day = typeof memory.updatedAt === 'string' ? memory.updatedAt.slice(0, 10) : ''
  const head = day ? `${memory.path ?? ''} · updated ${day}` : (memory.path ?? '')
  return `${head}\n# ${memory.title ?? ''}\n\n${memory.body ?? ''}`
}

function readTool(repo: string | null, config: MimirConfig): ToolDefinition {
  return {
    name: 'mimir_read',
    description:
      'Read one memory in full by its path. Search returns paths and summaries; this is the body behind one.',
    input: {
      type: 'object',
      properties: { path: { type: 'string', description: 'e.g. deploy/rollback' } },
      required: ['path'],
      additionalProperties: false,
    },
    async execute(input) {
      const args = input as ToolInput
      const result = await callTool(
        'memory_read',
        { path: String(args.path ?? ''), repo: repo ?? undefined },
        { url: config.url, token: config.token, timeoutMs: 8000 },
      )
      if (!result.ok) return { content: 'Nothing is stored at that path.' }
      return { content: renderMemory(result.result as { path?: string; title?: string; body?: string; updatedAt?: string }) }
    },
  }
}

function learnTool(repo: string | null, config: MimirConfig): ToolDefinition {
  return {
    name: 'mimir_learn',
    description:
      'Hand the part of this conversation worth keeping to Mimir. The project model writes at most three memories, in the background, so this answers at once.',
    input: {
      type: 'object',
      properties: {
        transcript: { type: 'string', description: 'The conversation excerpt, verbatim. Up to 32 KB.' },
        hint: { type: 'string', description: 'What to look for, e.g. "the deploy rollback"' },
      },
      required: ['transcript'],
      additionalProperties: false,
    },
    async execute(input, context) {
      const args = input as ToolInput
      const result = await callTool(
        'memory_learn',
        {
          transcript: String(args.transcript ?? ''),
          hint: typeof args.hint === 'string' ? args.hint : undefined,
          repo: repo ?? undefined,
          client: 'opencode',
          session: context?.sessionID,
        },
        { url: config.url, token: config.token, timeoutMs: 8000 },
      )
      if (!result.ok) return { content: `Could not hand that over (${result.error}).` }
      const queued = result.result as { queued?: boolean; reason?: string; projectCreated?: boolean }
      if (queued.queued) {
        return {
          content: `Queued. The model writes the memories in the background.${queued.projectCreated ? NEW_PROJECT : ''}`,
        }
      }
      // A refusal is a fact the agent should act on, not a failure to retry.
      return {
        content:
          typeof queued.reason === 'string' ? queued.reason : 'Mimir took no job: its queue is not running.',
      }
    },
  }
}
