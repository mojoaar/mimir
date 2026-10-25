import { InvalidSetting, readSetting, writeSetting } from './store'

/**
 * The `memories.embedding` column is `vector(768)`, so this is part of the
 * schema, not a preference: another size needs a migration and a full re-embed.
 */
export const EMBEDDING_DIM = 768

const PROVIDER_KEY = 'embedding_provider_id'
const MODEL_KEY = 'embedding_model'
const DIM_KEY = 'embedding_dim'

export type EmbeddingConfig = {
  providerId: string
  model: string
  dim: number
}

export async function getEmbeddingConfig(): Promise<EmbeddingConfig | null> {
  const [providerId, model, dim] = await Promise.all([
    readSetting<string>(PROVIDER_KEY),
    readSetting<string>(MODEL_KEY),
    readSetting<number>(DIM_KEY),
  ])
  if (!providerId || !model || typeof dim !== 'number') return null
  if (dim !== EMBEDDING_DIM) return null
  return { providerId, model, dim }
}

export async function setEmbeddingConfig(
  config: EmbeddingConfig,
  updatedBy: string,
): Promise<void> {
  if (config.dim !== EMBEDDING_DIM) {
    throw new InvalidSetting(
      `the embedding column holds ${EMBEDDING_DIM} dimensions; ${config.dim} would need a migration`,
    )
  }
  await writeSetting(PROVIDER_KEY, config.providerId, updatedBy)
  await writeSetting(MODEL_KEY, config.model, updatedBy)
  await writeSetting(DIM_KEY, config.dim, updatedBy)
}
