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

export const NOTICE_HEADER = '## Mimir took notes\n\n'
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

    const counts = new Map<string, { turns: number; nudgedAt: number }>()
    const snapshots = new Map<string, string>()
    const nudge = await ctx.session.hook('context', async (event) => {
      const state = counts.get(event.sessionID) ?? { turns: 0, nudgedAt: 0 }
      const turns = event.messages?.length ?? 0
      const shrank = turns < state.turns
      const due = shrank || turns - state.nudgedAt >= NUDGE_EVERY
      counts.set(event.sessionID, { turns, nudgedAt: due ? turns : state.nudgedAt })

      // A shrink is a compaction. The snapshot is the transcript that was just
      // summarised away, so it is the only copy of that detail left.
      if (shrank) {
        const compacted = snapshots.get(event.sessionID) ?? ''
        snapshots.delete(event.sessionID)
        if (compacted.length >= MIN_TRANSCRIPT) {
          const sent = await callTool(
            'memory_learn',
            { repo: repo ?? undefined, transcript: compacted, hint: LEARN_HINT },
            { ...config, timeoutMs: 4000 },
          ).catch(() => null)
          const queued = sent?.ok ? (sent.result as { queued?: boolean }).queued : undefined
          if (sent?.ok && queued !== false) {
            event.system.push({ type: 'text', text: `${NOTICE_HEADER}Mimir is writing what this session settled.` })
          }
        }
      } else {
        snapshots.set(event.sessionID, transcript(event.messages ?? []))
      }

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
