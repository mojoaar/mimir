import { Plugin } from '@opencode/plugin'
import { callTool, detectRepo } from './client.js'
import { resolveConfig } from './config.js'
import { registerTools } from './tools.js'

export const DIGEST_HEADER = '## What this project already knows (Mimir)\n\n'

/**
 * One injection point and two tools. The hook is what puts the project's
 * digest in front of the model before the first turn, so a session starts
 * informed without spending a tool call. Everything here is fail-soft: a slow
 * or missing Mimir must never hold up a session.
 */
export default Plugin.define({
  id: 'mimir',
  async setup(ctx) {
    const config = resolveConfig(ctx.options)
    if (!config) return

    // A folder without a git remote still needs a stable key, or every write
    // lands in a fresh project. The server maps absolute paths to `local:<hash>`.
    const repo = detectRepo(ctx.location.directory) ?? ctx.location.directory
    const seen = new Set<string>()

    // The hook runs before every model dispatch, so a session is fetched once
    // and then left alone.
    const session = await ctx.session.hook('context', async (event) => {
      if (seen.has(event.sessionID)) return
      // One attempt per session: a failed digest must not be re-paid before
      // every model dispatch, which is how often this hook runs.
      seen.add(event.sessionID)

      const result = await callTool(
        'memory_digest',
        { repo: repo ?? undefined, budget_tokens: 800 },
        { ...config, timeoutMs: 1500 },
      ).catch(() => null)

      if (!result?.ok) return
      const text = (result.result as { text?: string }).text?.trim()
      if (!text) return

      event.system.push({ type: 'text', text: `${DIGEST_HEADER}${text}` })
    })

    const tools = await registerTools(ctx, config, repo)

    return async () => {
      await tools.dispose()
      await session.dispose()
    }
  },
})
