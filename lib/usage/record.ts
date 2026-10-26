import { withAdmin } from '@/lib/db/tx'
import { estimateTokens } from './cost'

/** Who asked for the call. Only a named purpose is recorded. */
export type Purpose = 'extract' | 'embed.ingest' | 'embed.search' | 'embed.backfill' | 'probe'

export type CallEntry = {
  /** Null when there is no user behind the call, such as a scheduled job. */
  userId: string | null
  providerId: string
  preset: string
  model: string
  kind: 'llm' | 'embedding'
  purpose: Purpose
  promptTokens: number | null
  completionTokens: number | null
  costMicros: number | null
  status: number | null
  ok: boolean
}

/**
 * One row per attempt, success or failure. Recording must never break the call
 * it is describing, so everything is caught here rather than at the call site.
 */
export async function recordCall(entry: CallEntry): Promise<void> {
  try {
    await withAdmin((tx) =>
      tx.query(
        `insert into provider_calls
           (user_id, provider_id, preset, model, kind, purpose,
            prompt_tokens, completion_tokens, cost_micros, status, ok)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          entry.userId,
          entry.providerId,
          entry.preset,
          entry.model,
          entry.kind,
          entry.purpose,
          entry.promptTokens,
          entry.completionTokens,
          entry.costMicros,
          entry.status,
          entry.ok,
        ],
      ),
    )
  } catch (error) {
    console.error(`usage not recorded (${(error as Error).message})`)
  }
}

type Usage = {
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown }
  choices?: { message?: { content?: unknown } }[]
  data?: { results?: unknown } | unknown[]
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * The provider's own count when it sends one, an estimate when it does not.
 * The completion is estimated from the reply text, so a chatty model that
 * forgets `usage` still shows up as expensive instead of free.
 */
export function tokensOf(json: unknown, inputChars: number): {
  prompt: number
  completion: number | null
} {
  const body = (json ?? {}) as Usage
  const prompt = count(body.usage?.prompt_tokens) ?? estimateTokens(inputChars)
  const known = count(body.usage?.completion_tokens)
  if (known !== null) return { prompt, completion: known }

  const reply = body.choices?.[0]?.message?.content
  if (typeof reply === 'string' && reply !== '') {
    return { prompt, completion: estimateTokens(reply.length) }
  }
  return { prompt, completion: 0 }
}
