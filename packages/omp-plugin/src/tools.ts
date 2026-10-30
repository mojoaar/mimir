import { callTool, type MimirConfig } from './client.js'
import type { ExtensionAPI, ExtensionContext, ToolResult } from './omp.js'

const KINDS = ['note', 'fact', 'decision', 'gotcha', 'procedure', 'snippet', 'import'] as const

// A project created from a repo a teammate already knows about splits the
// knowledge in two until someone asks the owner for a grant.
const NEW_PROJECT = ' Started a new project. If a teammate already uses this repository, ask the owner for access.'

/** The server refuses an unknown kind, so an invented one falls back to the default. */
function kindOf(value: unknown): string {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value) ? value : 'note'
}

function result(text: string): ToolResult {
  return { content: [{ type: 'text', text }], details: {} }
}

/** Every tool fails soft: an unreachable Mimir must read as "carry on", not as an error. */
export function registerTools(
  pi: ExtensionAPI,
  config: MimirConfig,
  repo: (ctx: ExtensionContext) => string,
): void {
  const z = pi.zod

  pi.registerTool({
    name: 'mimir_digest',
    label: 'Mimir digest',
    description:
      'What this project has already settled, newest first, with dates. The same digest is put in front of you at the start of a session, so call this only to re-read it.',
    parameters: z.object({}),
    approval: 'read',
    async execute(_id, _params, _signal, _update, ctx) {
      const found = await callTool('memory_digest', { repo: repo(ctx), budget_tokens: 800 }, { ...config, timeoutMs: 8000 })
      if (!found.ok) return result(`Mimir is unavailable (${found.error}). Carry on without it.`)
      const text = (found.result as { text?: string }).text?.trim()
      return result(text || 'Nothing has been written to Mimir for this project yet.')
    },
  })

  pi.registerTool({
    name: 'mimir_remember',
    label: 'Remember in Mimir',
    description:
      'Store one durable fact in Mimir at a clear path, for example deploy/rollback. Writing the same path again replaces it and keeps the old body in history. One memory is one outcome, not a log.',
    parameters: z.object({
      path: z.string().describe('Where it belongs, e.g. auth/token-rotation'),
      body: z.string().describe('The fact, in Markdown. Not a log of what you did.'),
      title: z.string().optional().describe('One line. Defaults to the first line of the body.'),
      kind: z
        .string()
        .optional()
        .describe(`One of ${KINDS.join(', ')}. A procedure leads the next digest.`),
    }),
    approval: 'write',
    async execute(_id, params, _signal, _update, ctx) {
      const path = String(params.path ?? '')
      const body = String(params.body ?? '')
      const written = await callTool(
        'memory_write',
        // This API hands the tool no session id, so the client is all we can
        // honestly say about who wrote it.
        { path, body, title: params.title, kind: kindOf(params.kind), repo: repo(ctx), client: 'oh-my-pi' },
        { ...config, timeoutMs: 8000 },
      )
      if (!written.ok) return result(`Could not store that (${written.error}).`)
      const stored = written.result as { path?: string; created?: boolean; projectCreated?: boolean }
      return result(
        `${stored.created ? 'Stored' : 'Updated'} ${stored.path ?? path}.${stored.projectCreated ? NEW_PROJECT : ''}`,
      )
    },
  })

  pi.registerTool({
    name: 'mimir_search',
    label: 'Search Mimir',
    description:
      'Search what this project has already settled in Mimir. Returns paths, titles and summaries; read a path with the MCP server if you need the body.',
    parameters: z.object({
      query: z.string().describe('What to look for, in plain words'),
      path_prefix: z.string().optional().describe('Scope to a directory, e.g. auth'),
    }),
    approval: 'read',
    async execute(_id, params, _signal, _update, ctx) {
      const found = await callTool(
        'memory_search',
        { query: params.query, path_prefix: params.path_prefix, repo: repo(ctx) },
        { ...config, timeoutMs: 8000 },
      )
      if (!found.ok) return result(`Mimir is unavailable (${found.error}). Carry on without it.`)
      const hits = found.result as { path: string; title: string; summary: string | null }[]
      if (!Array.isArray(hits) || hits.length === 0) return result('Nothing matches that in Mimir.')
      return result(hits.map((hit) => `${hit.path}\n${hit.summary ?? hit.title}`).join('\n\n'))
    },
  })

  pi.registerTool({
    name: 'mimir_learn',
    label: 'Hand a session to Mimir',
    description:
      'Hand the part of this conversation worth keeping to Mimir. The project model writes at most three memories, in the background, so this answers at once.',
    parameters: z.object({
      transcript: z.string().describe('The conversation excerpt, verbatim. Up to 32 KB.'),
      hint: z.string().optional().describe('What to look for, e.g. "the deploy rollback"'),
    }),
    approval: 'write',
    async execute(_id, params, _signal, _update, ctx) {
      const queued = await callTool(
        'memory_learn',
        {
          transcript: params.transcript,
          hint: params.hint,
          repo: repo(ctx),
          client: 'oh-my-pi',
        },
        { ...config, timeoutMs: 8000 },
      )
      if (!queued.ok) return result(`Could not hand that over (${queued.error}).`)
      const job = queued.result as { queued?: boolean; reason?: string; projectCreated?: boolean }
      if (job.queued) {
        return result(
          `Queued. The model writes the memories in the background.${job.projectCreated ? NEW_PROJECT : ''}`,
        )
      }
      // A refusal is a fact the agent should act on, not a failure to retry.
      return result(
        typeof job.reason === 'string' ? job.reason : 'Mimir took no job: its queue is not running.',
      )
    },
  })
}
