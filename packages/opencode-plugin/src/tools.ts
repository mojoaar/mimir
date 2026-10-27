import { callTool } from './client.js'
import type { MimirConfig } from './config.js'

export type Registration = { dispose: () => Promise<void> }

type ToolExecutor = (input: any, context: any) => Promise<{ content: string }>
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
      callback: (editor: { list: () => readonly [string, { type?: string; url?: string }][] }) => void,
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
    editor.add(digestTool(repo))
    editor.add(rememberTool(repo))
  })
}

const IDLE: Registration = { dispose: async () => {} }

async function servedByMcp(ctx: ToolsContext, url: string): Promise<boolean> {
  let found = false
  const registration = await ctx.mcp.transform((editor) => {
    found = editor
      .list()
      .some(([, server]) => server.type === 'remote' && sameEndpoint(server.url, `${url}/mcp`))
  })
  await registration.dispose()
  return found
}

function sameEndpoint(actual: string | undefined, expected: string): boolean {
  return strip(actual) === strip(expected)
}

function strip(value: string | undefined): string {
  return (value ?? '').replace(/\/+$/, '')
}

function digestTool(repo: string | null): ToolDefinition {
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
      const result = await callTool(
        'memory_digest',
        { budget_tokens: input?.budget_tokens ?? 800, repo: repo ?? undefined },
        { timeoutMs: 5000 },
      )
      if (!result.ok) return { content: `Mimir is unavailable (${result.error}). Carry on without it.` }
      const digest = result.result as { text?: string }
      return { content: digest.text?.trim() || 'Mimir has nothing stored for this project yet.' }
    },
  }
}

function rememberTool(repo: string | null): ToolDefinition {
  return {
    name: 'mimir_remember',
    description:
      'Store one durable fact in Mimir. Use a path like "deploy/rollback" or "auth/token-rotation"; rewriting the same path replaces what was there.',
    input: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Slash-separated memory path, e.g. deploy/rollback' },
        body: { type: 'string', description: 'What to remember, written so it reads without the conversation' },
        kind: { type: 'string', enum: ['note', 'fact', 'decision', 'gotcha', 'snippet'] },
      },
      required: ['path', 'body'],
      additionalProperties: false,
    },
    async execute(input) {
      const result = await callTool(
        'memory_write',
        { path: input.path, body: input.body, kind: input.kind, repo: repo ?? undefined },
        { timeoutMs: 8000 },
      )
      if (!result.ok) return { content: `Could not store that (${result.error}).` }
      const written = result.result as { path?: string; created?: boolean }
      return { content: `${written.created ? 'Stored' : 'Updated'} ${written.path ?? input.path}.` }
    },
  }
}
