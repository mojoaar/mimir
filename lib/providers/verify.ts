import { chatComplete, embed, ProviderError, type ProviderTarget } from './client'
import { getProviderSecret, recordVerification } from './service'

export type VerifyResult = { ok: true; dim?: number } | { ok: false; error: string }

const PROBE_TIMEOUT_MS = 15_000

/** Probes a provider and records the outcome. The key never enters the result. */
export async function verifyProvider(
  userId: string,
  id: string,
  overrides: { model?: string } = {},
): Promise<VerifyResult> {
  const secret = await getProviderSecret(userId, id)
  const target: ProviderTarget = {
    id: secret.id,
    preset: secret.preset,
    baseUrl: secret.baseUrl,
    // Probe what is about to be saved: probing the stored model while saving
    // another would pass at 768 and then embed at 1024 forever.
    model: overrides.model ?? secret.model,
    apiKey: secret.apiKey,
    ownerId: userId,
    price: { input: secret.inputPrice, output: secret.outputPrice },
  }

  try {
    const result =
      secret.kind === 'embedding' ? await probeEmbedding(target) : await probeChat(target)
    await recordVerification(userId, id, null)
    return result
  } catch (error) {
    const message = error instanceof ProviderError ? error.message : 'the provider could not be reached'
    await recordVerification(userId, id, message.slice(0, 300))
    return { ok: false, error: message }
  }
}

async function probeEmbedding(target: ProviderTarget): Promise<VerifyResult> {
  const [vector] = await embed(target, ['ping'], { timeoutMs: PROBE_TIMEOUT_MS, purpose: 'probe' })
  return { ok: true, dim: vector?.length ?? 0 }
}

/**
 * An LLM is probed with the thing Mimir does with it: one short completion.
 * Listing models instead failed on every provider without a models endpoint
 * (OpenCode Go and Console among them), reporting a broken key when the key
 * was fine.
 */
async function probeChat(target: ProviderTarget): Promise<VerifyResult> {
  await chatComplete(target, [{ role: 'user', content: 'ping' }], {
    timeoutMs: PROBE_TIMEOUT_MS,
    purpose: 'probe',
  })
  return { ok: true }
}
