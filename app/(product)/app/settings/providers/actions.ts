'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/context'
import { audit } from '@/lib/audit'
import { presetFor, type PresetId, type ProviderKind } from '@/lib/providers/presets'
import {
  createProvider,
  deleteProvider,
  listProviders,
  setDefaultProvider,
} from '@/lib/providers/service'
import { verifyProvider } from '@/lib/providers/verify'

export type ProviderFormState = { ok?: boolean; error?: string }

const PATH = '/app/settings/providers'

// Codes the service raises on purpose. Anything else is a bug and must not be
// shown to a user with a driver message attached.
const KNOWN = new Set(['invalid_params', 'not_found', 'provider_error'])

function messageOf(error: unknown, fallback: string): string {
  const code = (error as { code?: string }).code
  if (code && KNOWN.has(code)) return (error as Error).message
  return fallback
}

export async function createProviderAction(
  _prev: ProviderFormState,
  formData: FormData,
): Promise<ProviderFormState> {
  const user = await requireUser()

  const kind = String(formData.get('kind') ?? 'llm')
  const presetId = String(formData.get('preset') ?? '')
  const label = String(formData.get('label') ?? '').trim()
  const model = String(formData.get('model') ?? '').trim()
  const baseUrl = String(formData.get('baseUrl') ?? '').trim()
  const apiKey = String(formData.get('apiKey') ?? '').trim()
  const isDefault = formData.get('isDefault') === 'on'

  if (kind !== 'llm' && kind !== 'embedding') return { error: 'Pick a provider type.' }
  if (!label) return { error: 'Give the provider a label so you can tell it apart later.' }

  let preset
  try {
    preset = presetFor(presetId)
  } catch {
    return { error: 'Pick a provider from the list.' }
  }
  if (!preset.kinds.includes(kind as ProviderKind)) {
    return { error: `${preset.label} cannot be used for ${kind === 'llm' ? 'language models' : 'embeddings'}.` }
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
    return { error: messageOf(error, 'Could not save the provider.') }
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

export async function verifyProviderAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const id = String(formData.get('id') ?? '')
  if (!id) return

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
}
