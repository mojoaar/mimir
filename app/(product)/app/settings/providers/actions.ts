'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/context'
import { audit } from '@/lib/audit'
import { translator, type Translate } from '@/lib/i18n/request'
import { actionMessage } from '@/lib/i18n/errors'
import { presetFor, type PresetId, type ProviderKind } from '@/lib/providers/presets'
import {
  createProvider,
  deleteProvider,
  listProviders,
  setDefaultProvider,
  setProviderPrices,
} from '@/lib/providers/service'
import { verifyProvider } from '@/lib/providers/verify'

export type ProviderFormState = { ok?: boolean; error?: string }
export type VerifyState = { ok?: boolean; error?: string; dim?: number }

const PATH = '/app/settings/providers'

// Codes the service raises on purpose. Anything else is a bug and must not be
// shown to a user with a driver message attached.
const KNOWN = new Set(['invalid_params', 'not_found', 'provider_error'])

function messageOf(error: unknown, t: Translate, fallback: string): string {
  const mapped = actionMessage(error, t)
  return mapped === t('app.error.generic') ? fallback : mapped
}

export async function createProviderAction(
  _prev: ProviderFormState,
  formData: FormData,
): Promise<ProviderFormState> {
  const user = await requireUser()
  const t = await translator()

  const kind = String(formData.get('kind') ?? 'llm')
  const presetId = String(formData.get('preset') ?? '')
  const label = String(formData.get('label') ?? '').trim()
  const model = String(formData.get('model') ?? '').trim()
  const baseUrl = String(formData.get('baseUrl') ?? '').trim()
  const apiKey = String(formData.get('apiKey') ?? '').trim()
  const isDefault = formData.get('isDefault') === 'on'

  if (kind !== 'llm' && kind !== 'embedding') return { error: t('app.providers.needKind') }
  if (!label) return { error: t('app.providers.needLabel') }

  let preset
  try {
    preset = presetFor(presetId)
  } catch {
    return { error: t('app.providers.needPreset') }
  }
  if (!preset.kinds.includes(kind as ProviderKind)) {
    return {
      error: t('app.providers.wrongKind', {
        preset: preset.label,
        kind: kind === 'llm' ? t('app.providers.kindLlm') : t('app.providers.kindEmbedding'),
      }),
    }
  }

  try {
    await createProvider({
      userId: user.id,
      kind: kind as ProviderKind,
      preset: presetId as PresetId,
      label,
      model: model || preset.defaultModel,
      baseUrl: baseUrl || preset.baseUrl,
      apiKey: apiKey || undefined,
      dim: kind === 'embedding' ? preset.defaultDim : undefined,
      isDefault,
    })
  } catch (error) {
    return { error: messageOf(error, t, t('app.providers.saveFailed')) }
  }

  revalidatePath(PATH)
  return { ok: true }
}

export async function savePricesAction(
  _prev: ProviderFormState,
  formData: FormData,
): Promise<ProviderFormState> {
  const user = await requireUser()
  const t = await translator()
  const id = String(formData.get('id') ?? '')
  if (!id) return { error: t('app.error.generic') }

  const read = (name: string): number | null | undefined => {
    const raw = String(formData.get(name) ?? '').trim()
    if (raw === '') return null
    const value = Number(raw)
    return Number.isFinite(value) && value >= 0 ? value : undefined
  }
  const input = read('inputPrice')
  const output = read('outputPrice')
  if (input === undefined || output === undefined) {
    return { error: t('app.providers.priceInvalid') }
  }

  try {
    await setProviderPrices(user.id, id, { input, output })
  } catch (error) {
    return { error: messageOf(error, t, t('app.providers.saveFailed')) }
  }

  revalidatePath(PATH)
  return { ok: true }
}

export async function deleteProviderAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const id = String(formData.get('id') ?? '')
  if (!id) return

  await deleteProvider(user.id, id)
  revalidatePath(PATH)
}

export async function setDefaultAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const id = String(formData.get('id') ?? '')
  if (!id) return

  await setDefaultProvider(user.id, id)
  revalidatePath(PATH)
}

/**
 * Returns the outcome so the button can say what happened. A provider probe can
 * take fifteen seconds; with nothing on screen the row looked untouched and the
 * press read as a no-op.
 */
export async function verifyProviderAction(
  _prev: VerifyState | null,
  formData: FormData,
): Promise<VerifyState> {
  const user = await requireUser()
  const id = String(formData.get('id') ?? '')
  if (!id) return {}

  const result = await verifyProvider(user.id, id)
  const row = (await listProviders(user.id)).find((p) => p.id === id)

  // Only the outcome and the provider's identity are recorded: the error text
  // can carry a URL with credentials in it, and the key is never read here.
  await audit({
    actorType: 'user',
    actorId: user.id,
    action: 'provider.verify',
    targetType: 'provider',
    targetId: id,
    detail: { ok: result.ok, preset: row?.preset, kind: row?.kind, label: row?.label },
  })

  revalidatePath(PATH)
  return result.ok ? { ok: true, dim: result.dim } : { ok: false, error: result.error }
}
