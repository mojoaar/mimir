'use server'

import { revalidatePath } from 'next/cache'
import { audit } from '@/lib/audit'
import { requireAdmin } from '@/lib/auth/admin'
import { sendJob } from '@/lib/jobs/boss'
import { enqueueEmbeddingRebuild } from '@/lib/jobs/enqueue'
import { getProviderSecret, recordVerification } from '@/lib/providers/service'
import { verifyProvider } from '@/lib/providers/verify'
import { EMBEDDING_DIM, setEmbeddingConfig } from '@/lib/settings/embedding'
import { translator, type Translate } from '@/lib/i18n/request'
import { flagError } from '@/lib/http/action-error'

export type EmbeddingFormState = { ok?: string; error?: string }

export async function saveEmbeddingAction(
  _prev: EmbeddingFormState,
  formData: FormData,
): Promise<EmbeddingFormState> {
  const user = await requireAdmin()
  const t = await translator()

  const providerId = String(formData.get('providerId') ?? '')
  const model = String(formData.get('model') ?? '').trim()
  if (!providerId || !model) return { error: t('app.admin.embeddings.chooseBoth') }

  try {
    // The probe decides the dimension: the column has one size, and a form
    // field the operator can type into would only let them lie to it.
    const secret = await getProviderSecret(user.id, providerId)
    if (secret.kind !== 'embedding') {
      return { error: t('app.admin.embeddings.notEmbedding') }
    }

    const probe = await verifyProvider(user.id, providerId, { model })
    if (!probe.ok) return { error: t('app.admin.embeddings.probeFailed', { error: probe.error }) }

    const dim = probe.dim
    if (dim === undefined) {
      return { error: t('app.admin.embeddings.probeFailed', { error: t('app.admin.embeddings.noDim') }) }
    }

    if (dim !== EMBEDDING_DIM) {
      return { error: t('app.admin.embeddings.wrongDims', { expected: EMBEDDING_DIM, actual: dim }) }
    }

    const { changed } = await setEmbeddingConfig({ providerId, model, dim }, user.id)
    await recordVerification(user.id, providerId, null)
    // The rebuild job clears the vectors itself, once it is running. Doing it
    // here would empty search on an install whose queue is down.
    if (!(await enqueueEmbeddingRebuild(changed))) {
      return { error: t('app.admin.backups.queueDown') }
    }
    revalidatePath('/app/admin/settings')
    return { ok: t('app.admin.embeddings.saved', { model, count: dim }) }
  } catch (error) {
    return { error: flagError(error, t, t('app.admin.embeddings.saveFailed')) }
  }
}

export type ReembedFormState = { ok?: string; error?: string }

export async function reembedAction(
  _prev: ReembedFormState,
  formData: FormData,
): Promise<ReembedFormState> {
  const user = await requireAdmin()
  const t = await translator()

  if (String(formData.get('confirm') ?? '') !== 'reembed') {
    return { error: t('app.admin.embeddings.needConfirm') }
  }

  // Queued, not run inline: a large install embeds for minutes and the request
  // must not hold that long. runReembed reports nothing back, so the audit row
  // records the request rather than a total it cannot know yet.
  const jobId = await sendJob('reembed', { confirm: true })
  if (!jobId) return { error: t('app.admin.backups.queueDown') }

  await audit({
    actorType: 'user',
    actorId: user.id,
    action: 'admin.reembed',
    targetType: 'settings',
    targetId: 'embedding',
    detail: { queued: true },
  })

  revalidatePath('/app/admin/settings')
  return { ok: t('app.admin.embeddings.queued') }
}
