import { Plugin } from '@opencode/plugin'
import { callTool, detectRepo } from './client.js'
import { resolveConfig } from './config.js'
import { registerTools } from './tools.js'

export const DIGEST_HEADER = '## What this project already knows (Mimir)\n\n'
export const NUDGE_HEADER = '## Memory check (Mimir)\n\n'

/**
 * A fact written before a compaction is cheap; one that has already been
 * summarised away is gone. So the reminder comes every twenty turns, and again
 * the moment the transcript shrinks, which is what a compaction looks like from
 * the message list this hook is handed.
 */
const NUDGE_EVERY = 20
const NUDGE =
  'If this session settled a decision, a convention or a gotcha that is not in Mimir yet, ' +
  'call memory_write now at one clear path, or hand the conversation over with mimir_learn, ' +
  'before the detail is compacted away.'

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

    const counts = new Map<string, { turns: number; nudgedAt: number }>()
    const nudge = await ctx.session.hook('context', async (event) => {
      const state = counts.get(event.sessionID) ?? { turns: 0, nudgedAt: 0 }
      const turns = event.messages?.length ?? 0
      const due = turns < state.turns || turns - state.nudgedAt >= NUDGE_EVERY
      counts.set(event.sessionID, { turns, nudgedAt: due ? turns : state.nudgedAt })
      if (due) event.system.push({ type: 'text', text: `${NUDGE_HEADER}${NUDGE}` })
    })

    const tools = await registerTools(ctx, config, repo)

    return async () => {
      await tools.dispose()
      await session.dispose()
      await nudge.dispose()
    }
  },
})
