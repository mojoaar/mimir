import { embed } from '@/lib/providers/client'
import { resolveEmbeddingProvider } from '@/lib/providers/resolve'
import { EMBEDDING_DIM } from '@/lib/settings/embedding'
import type { Purpose } from '@/lib/usage/record'

/**
 * nomic-embed-text has an 8192 token window and a memory body can exceed it.
 * Truncating keeps the call inside the model instead of failing it.
 */
export const EMBED_TEXT_LIMIT = 8000

export function toVectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`
}

/**
 * Returns a pgvector literal, or null. Never throws: a memory is worth more
 * than its vector, so a broken provider degrades search instead of losing the
 * write. The log line carries the reason and nothing else — no key, no text.
 */
export async function embedText(
  text: string,
  options: {
    timeoutMs?: number
    inputType?: 'query' | 'document'
    purpose?: Purpose
  } = {},
): Promise<string | null> {
  // Everything, including provider resolution, is inside the try: a rotated
  // MIMIR_SECRET makes decryption throw, and that must not fail the write.
  try {
    const provider = await resolveEmbeddingProvider()
    if (!provider) return null

    const [values] = await embed(provider, [text.slice(0, EMBED_TEXT_LIMIT)], {
      timeoutMs: options.timeoutMs ?? 10_000,
      dimension: EMBEDDING_DIM,
      inputType: options.inputType,
      purpose: options.purpose,
    })

    if (!values || values.length !== EMBEDDING_DIM) {
      console.error(
        `embedding unavailable (returned ${values?.length ?? 0} dimensions, expected ${EMBEDDING_DIM})`,
      )
      return null
    }

    // pgvector rejects the whole write on a non-numeric literal, so a provider
    // that answers with strings must degrade here instead of reaching SQL.
    if (!values.every((value) => typeof value === 'number' && Number.isFinite(value))) {
      console.error('embedding unavailable (the vector held a value that is not a number)')
      return null
    }

    return toVectorLiteral(values)
  } catch (error) {
    console.error(`embedding unavailable (${(error as Error).message})`)
    return null
  }
}
