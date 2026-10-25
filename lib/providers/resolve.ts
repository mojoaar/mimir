import { withAdmin } from '../db/tx'
import { getEmbeddingConfig } from '../settings/embedding'
import type { ProviderTarget } from './client'
import { getProviderSecret, listProviders } from './service'

/**
 * Extraction runs as background work with no user, so the owner has to be read
 * with the admin pool — but the key is still the owner's own row, never anyone
 * else's. A project override pointing at a provider the owner does not own is
 * ignored rather than trusted.
 */
export async function resolveExtractionProvider(projectId: string): Promise<ProviderTarget | null> {
  const project = await withAdmin(async (tx) => {
    const { rows } = await tx.query<{ owner_user_id: string; llm_provider_id: string | null }>(
      'select owner_user_id, llm_provider_id from projects where id = $1',
      [projectId],
    )
    return rows[0] ?? null
  })
  if (!project) return null

  const ownerId = project.owner_user_id
  const target = project.llm_provider_id
    ? await ownedTarget(ownerId, project.llm_provider_id)
    : await defaultTarget(ownerId)

  return target?.apiKey ? target : null
}

async function ownedTarget(userId: string, providerId: string): Promise<ProviderTarget | null> {
  try {
    const secret = await getProviderSecret(userId, providerId)
    return toTarget(secret)
  } catch {
    return null
  }
}

async function defaultTarget(userId: string): Promise<ProviderTarget | null> {
  const rows = await listProviders(userId, 'llm')
  const chosen = rows.find((row) => row.isDefault) ?? null
  if (!chosen) return null
  return ownedTarget(userId, chosen.id)
}

function toTarget(secret: {
  id: string
  preset: ProviderTarget['preset']
  baseUrl: string
  model: string
  apiKey: string | null
}): ProviderTarget {
  return { id: secret.id, preset: secret.preset, baseUrl: secret.baseUrl, model: secret.model, apiKey: secret.apiKey }
}

/**
 * Embeddings are install-wide: one model, one vector space, so the admin owns
 * the row. This is the documented exception to "a key belongs to one user".
 */
export async function resolveEmbeddingProvider(): Promise<ProviderTarget | null> {
  const config = await getEmbeddingConfig()
  if (!config) return null

  const row = await withAdmin(async (tx) => {
    const { rows } = await tx.query<{
      id: string
      user_id: string
      preset: ProviderTarget['preset']
      base_url: string
      model: string
      api_key_enc: Buffer | null
    }>('select id, user_id, preset, base_url, model, api_key_enc from providers where id = $1', [config.providerId])
    return rows[0] ?? null
  })

  if (!row) {
    console.warn(`mimir: embedding provider ${config.providerId} is gone; memory will not be embedded`)
    return null
  }

  const secret = await getProviderSecret(row.user_id, row.id)
  const target = toTarget(secret)
  // The config pins the model; a row edited later must not silently change it.
  return { ...target, model: config.model }
}
