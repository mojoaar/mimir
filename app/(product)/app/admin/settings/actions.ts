'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/admin'
import { sendJob } from '@/lib/jobs/boss'
import { getProviderSecret, recordVerification } from '@/lib/providers/service'
import { verifyProvider } from '@/lib/providers/verify'
import { EMBEDDING_DIM, setEmbeddingConfig } from '@/lib/settings/embedding'

export type EmbeddingFormState = { ok?: string; error?: string }

const KNOWN = new Set(['invalid_params', 'not_found', 'provider_error'])

function message(error: unknown): string {
  const code = (error as { code?: string }).code
  return code && KNOWN.has(code) ? String((error as Error).message) : 'Could not save the embedding model.'
}

export async function saveEmbeddingAction(
  _prev: EmbeddingFormState,
  formData: FormData,
): Promise<EmbeddingFormState> {
  const user = await requireAdmin()

  const providerId = String(formData.get('providerId') ?? '')
  const model = String(formData.get('model') ?? '').trim()
  if (!providerId || !model) return { error: 'Choose a provider and a model.' }

  try {
    // The probe decides the dimension: the column has one size, and a form
    // field the operator can type into would only let them lie to it.
    const secret = await getProviderSecret(user.id, providerId)
    if (secret.kind !== 'embedding') {
      return { error: 'That provider is not an embedding provider.' }
    }

    const probe = await verifyProvider(user.id, providerId)
    if (!probe.ok) return { error: `The provider did not answer: ${probe.error}` }

    if (probe.dim !== EMBEDDING_DIM) {
      return {
        error: `the embedding column holds ${EMBEDDING_DIM} dimensions; ${probe.dim} would need a migration`,
      }
    }

    await setEmbeddingConfig({ providerId, model, dim: probe.dim }, user.id)
    await recordVerification(user.id, providerId, null)
    // Rows written before this moment have no vector; embed them in the background.
    await sendJob('backfill', {})
    revalidatePath('/app/admin/settings')
    return { ok: `Embeddings now use ${model} (${probe.dim} dimensions).` }
  } catch (error) {
    return { error: message(error) }
  }
}
