import { callTool, detectRepo, resolveConfig } from './client.js'
import type { ContextEvent, ContextResult, DeveloperMessage, ExtensionAPI } from './omp.js'
import { registerTools } from './tools.js'

export const DIGEST_HEADER = '## What this project already knows (Mimir)\n\n'
export const NUDGE_HEADER = '## Memory check (Mimir)\n\n'

/**
 * A fact written before a compaction is cheap; one that has already been
 * summarised away is gone. So the reminder comes every twenty messages, and
 * again the moment the transcript shrinks, which is what a compaction looks
 * like from the message list this hook is handed.
 */
const NUDGE_EVERY = 20
const NUDGE =
  'If this session settled a decision, a convention or a gotcha that is not in Mimir yet, ' +
  'call mimir_remember now at one clear path, or hand the conversation over with mimir_learn, ' +
  'before the detail is compacted away.'

/**
 * One injection point and four tools. The digest goes in front of the model
 * before the first call, so a session starts informed without spending a tool
 * call. Everything here is fail-soft: a slow or missing Mimir must never hold
 * up a session.
 */
export default function mimir(pi: ExtensionAPI): void {
  const config = resolveConfig()
  if (!config) return

  // A folder without a git remote still needs a stable key, or every write
  // lands in a fresh project. The server maps absolute paths to `local:<hash>`.
  let repository: string | null = null
  const repo = (cwd: string) => (repository ??= detectRepo(cwd) ?? cwd)

  let injected = false
  let state = { messages: 0, nudgedAt: 0 }

  const reset = () => {
    injected = false
    state = { messages: 0, nudgedAt: 0 }
  }
  pi.on('session_start', reset)
  // A compacted transcript has lost the digest with everything else, so it is
  // fetched again for the next call rather than waiting for a new session.
  pi.on('session_compact', reset)

  pi.on<ContextEvent>('context', async (event, ctx): Promise<ContextResult> => {
    const out = [...event.messages]
    let changed = false

    // One attempt per session: a failed digest must not be re-paid before
    // every model call, which is how often this fires.
    if (!injected) {
      injected = true
      const found = await callTool(
        'memory_digest',
        { repo: repo(ctx.cwd), budget_tokens: 800 },
        { ...config, timeoutMs: 1500 },
      ).catch(() => null)
      const text = found?.ok ? (found.result as { text?: string }).text?.trim() : ''
      if (text) {
        out.push(message(`${DIGEST_HEADER}${text}`))
        changed = true
      }
    }

    const messages = event.messages.length
    const due = messages < state.messages || messages - state.nudgedAt >= NUDGE_EVERY
    state = { messages, nudgedAt: due ? messages : state.nudgedAt }
    if (due) {
      out.push(message(`${NUDGE_HEADER}${NUDGE}`))
      changed = true
    }

    return changed ? { messages: out } : undefined
  })

  registerTools(pi, config, (ctx) => repo(ctx.cwd))
}

/**
 * `developer` is omp's instruction role: the digest is context, not a turn the
 * user typed, and `synthetic` keeps it out of anything that counts real messages.
 */
function message(text: string): DeveloperMessage {
  return { role: 'developer', content: text, timestamp: Date.now(), synthetic: true }
}
