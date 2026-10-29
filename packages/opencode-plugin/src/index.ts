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

export const MAX_TRANSCRIPT = 32_000
/** A compaction of nothing is not worth a model call. */
export const MIN_TRANSCRIPT = 500
const LEARN_HINT =
  'This session was just compacted. Keep what was decided, what broke and any convention, and skip what Mimir already has.'

/** Message text is shaped differently by each provider, so read what we can and skip the rest. */
export function transcript(messages: unknown[]): string {
  const lines: string[] = []
  for (const message of messages) {
    if (typeof message !== 'object' || message === null) continue
    const record = message as { role?: unknown; content?: unknown; parts?: unknown }
    const role = typeof record.role === 'string' ? record.role : 'message'
    const body = textOf(record.content) || textOf(record.parts)
    if (body) lines.push(`${role}: ${body}`)
  }
  return lines.join('\n\n').slice(-MAX_TRANSCRIPT)
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (!Array.isArray(value)) return ''
  return value
    .map((part) => {
      if (typeof part === 'string') return part
      const text = (part as { text?: unknown })?.text
      return typeof text === 'string' ? text : ''
    })
    .join('\n')
    .trim()
}

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

    // The reminder rides the message count. A shrink means a compaction just
    // happened, which is the worst moment to lose a detail, so it nudges early.
    const counts = new Map<string, { turns: number; nudgedAt: number }>()
    const nudge = await ctx.session.hook('context', async (event) => {
      const state = counts.get(event.sessionID) ?? { turns: 0, nudgedAt: 0 }
      const turns = event.messages?.length ?? 0
      const due = turns < state.turns || turns - state.nudgedAt >= NUDGE_EVERY
      counts.set(event.sessionID, { turns, nudgedAt: due ? turns : state.nudgedAt })

      if (due) event.system.push({ type: 'text', text: `${NUDGE_HEADER}${NUDGE}` })
    })

    // OpenCode fires this for its own compaction and hands over the messages
    // being replaced. A compressed view swapped in by another plugin never
    // reaches it, which is why the message count is not a signal.
    const compacted = new Set<string>()
    const compaction = await ctx.session.hook('compaction', async (event) => {
      // One compaction can ask twice. The second call must not write again.
      if (compacted.has(event.sessionID)) return
      const text = transcript(event.messages ?? [])
      if (text.length < MIN_TRANSCRIPT) return
      compacted.add(event.sessionID)

      const sent = await callTool(
        'memory_learn',
        { repo: repo ?? undefined, transcript: text, hint: LEARN_HINT },
        { ...config, timeoutMs: 4000 },
      ).catch(() => null)

      // Nothing is written to event.system here: this request's prompt becomes
      // the summary that replaces the conversation. A failure gives the session
      // its one chance back, so an outage does not use the compaction up.
      if (!sent?.ok) compacted.delete(event.sessionID)
    })

    const tools = await registerTools(ctx, config, repo)

    return async () => {
      await tools.dispose()
      await session.dispose()
      await nudge.dispose()
      await compaction.dispose()
    }
  },
})
