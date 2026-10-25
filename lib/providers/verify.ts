import { embed, listModels, ProviderError, type ProviderTarget } from './client'
import { getProviderSecret, recordVerification } from './service'

export type VerifyResult = { ok: true; models?: string[]; dim?: number } | { ok: false; error: string }

const PROBE_TIMEOUT_MS = 15_000

/** Probes a provider and records the outcome. The key never enters the result. */
export async function verifyProvider(userId: string, id: string): Promise<VerifyResult> {
  const secret = await getProviderSecret(userId, id)
  const target: ProviderTarget = {
    id: secret.id,
    preset: secret.preset,
    baseUrl: secret.baseUrl,
    model: secret.model,
    apiKey: secret.apiKey,
  }

  try {
    const result =
      secret.kind === 'embedding'
        ? await probeEmbedding(target)
        : { ok: true as const, models: await listModels(target, { timeoutMs: PROBE_TIMEOUT_MS }) }
    await recordVerification(userId, id, null)
    return result
  } catch (error) {
    const message = error instanceof ProviderError ? error.message : 'the provider could not be reached'
    await recordVerification(userId, id, message.slice(0, 300))
    return { ok: false, error: message }
  }
}

async function probeEmbedding(target: ProviderTarget): Promise<VerifyResult> {
  const [vector] = await embed(target, ['ping'], { timeoutMs: PROBE_TIMEOUT_MS })
  return { ok: true, dim: vector?.length ?? 0 }
}
