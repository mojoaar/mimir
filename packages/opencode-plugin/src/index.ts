import { tool, type Plugin } from '@opencode-ai/plugin'
import { callTool, detectRepo } from './client.js'

const z = tool.schema

/**
 * Two tools rather than an automatic injection: the plugin API exposes no
 * documented way to add context to a session, so the agent is told to call
 * `mimir_digest` first (see the instruction block in the README).
 */
export const MimirPlugin: Plugin = async () => ({
  tool: {
    mimir_digest: tool({
      description:
        'Load what this project already knows from Mimir. Call once at the start of a session, before searching for anything.',
      args: {
        budget_tokens: z.number().int().positive().optional().describe('Rough size cap, default 800'),
      },
      async execute(args, context) {
        const result = await callTool(
          'memory_digest',
          { budget_tokens: args.budget_tokens, repo: detectRepo(context.directory) ?? undefined },
          { timeoutMs: 5000 },
        )
        if (!result.ok) return `Mimir is unavailable (${result.error}). Carry on without it.`
        const digest = result.result as { text?: string }
        return digest.text?.trim() || 'Mimir has nothing stored for this project yet.'
      },
    }),

    mimir_remember: tool({
      description:
        'Store one durable fact in Mimir. Use a path like "deploy/rollback" or "auth/token-rotation"; rewriting the same path replaces what was there.',
      args: {
        path: z.string().describe('Slash-separated memory path, e.g. deploy/rollback'),
        body: z.string().describe('What to remember, written so it reads without the conversation'),
        kind: z.enum(['note', 'fact', 'decision', 'gotcha', 'snippet']).optional(),
      },
      async execute(args, context) {
        const result = await callTool(
          'memory_write',
          {
            path: args.path,
            body: args.body,
            kind: args.kind,
            repo: detectRepo(context.directory) ?? undefined,
          },
          { timeoutMs: 8000 },
        )
        if (!result.ok) return `Could not store that (${result.error}).`
        const written = result.result as { path?: string; created?: boolean }
        return `${written.created ? 'Stored' : 'Updated'} ${written.path ?? args.path}.`
      },
    }),
  },
})

export default MimirPlugin
