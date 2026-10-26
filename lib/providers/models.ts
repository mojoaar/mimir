import { PRESETS, type PresetId, type PresetModel, type ProviderKind } from './presets'

const REFRESH_SECONDS = 3600

/**
 * The models a preset can offer. A preset either ships its list or points at a
 * public catalogue; anything else gets an empty list, which the form turns back
 * into a text field. A failure is not an error: a provider being down must not
 * take the providers page with it.
 */
export async function availableModels(
  presetId: PresetId,
  kind: ProviderKind,
  deps: { fetch?: typeof fetch } = {},
): Promise<PresetModel[]> {
  const preset = PRESETS[presetId]
  const fixed = preset.models?.[kind]
  if (fixed) return fixed
  if (!preset.modelsUrl) return []

  const doFetch = deps.fetch ?? fetch
  try {
    const response = await doFetch(preset.modelsUrl, {
      next: { revalidate: REFRESH_SECONDS },
      signal: AbortSignal.timeout(10_000),
      // A public endpoint must not be able to redirect the server into the network.
      redirect: 'manual',
    })
    if (!response.ok) return []
    const json = (await response.json()) as { data?: { id?: unknown }[] }
    return (json.data ?? [])
      .map((row) => row.id)
      .filter((id): id is string => typeof id === 'string')
      .map((id) => ({ id }))
  } catch {
    return []
  }
}
