import { audit } from '../audit'
import { getConfig } from '../config'
import { decrypt, deriveKey, encrypt, redact } from '../crypto'
import { withUser } from '../db/tx'
import { assertPublicProviderHost, checkProviderUrl } from './url'
import { PRESETS, presetFor, type PresetId, type ProviderKind } from './presets'

export type { ProviderKind } from './presets'

export type ProviderSummary = {
  id: string
  kind: ProviderKind
  preset: string
  label: string
  baseUrl: string
  model: string
  dim: number | null
  hasKey: boolean
  keyHint: string | null
  isDefault: boolean
  lastVerifiedAt: Date | null
  lastError: string | null
}

export type ProviderInput = {
  userId: string
  kind: ProviderKind
  preset: PresetId
  label: string
  baseUrl?: string
  model: string
  apiKey?: string
  dim?: number
  isDefault?: boolean
}

export type ProviderSecret = {
  id: string
  baseUrl: string
  model: string
  preset: PresetId
  kind: ProviderKind
  dim: number | null
  apiKey: string | null
}

type Row = {
  id: string
  kind: ProviderKind
  preset: string
  label: string
  base_url: string
  model: string
  dim: number | null
  api_key_hint: string | null
  api_key_enc: Buffer | null
  is_default: boolean
  last_verified_at: Date | null
  last_error: string | null
}

const KEY_INFO = 'mimir/provider-key'

function keyEncryptionKey(): Buffer {
  return deriveKey(getConfig().secret, KEY_INFO)
}

function toSummary(row: Row): ProviderSummary {
  return {
    id: row.id,
    kind: row.kind,
    preset: row.preset,
    label: row.label,
    baseUrl: row.base_url,
    model: row.model,
    dim: row.dim,
    hasKey: row.api_key_enc !== null,
    keyHint: row.api_key_hint,
    isDefault: row.is_default,
    lastVerifiedAt: row.last_verified_at,
    lastError: row.last_error,
  }
}

function notFound(): Error & { code: string } {
  const error = new Error('not_found') as Error & { code: string }
  error.code = 'not_found'
  return error
}

function invalid(message: string): Error & { code: string } {
  const error = new Error(`invalid_params: ${message}`) as Error & { code: string }
  error.code = 'invalid_params'
  return error
}

/**
 * A key short enough for the last four characters to matter is hidden whole:
 * showing four of six characters is not a hint, it is half the key.
 */
function hintFor(apiKey: string): string {
  return apiKey.length <= 8 ? '********' : redact(apiKey)
}

export async function createProvider(input: ProviderInput): Promise<ProviderSummary> {
  const preset = presetFor(input.preset)
  const baseUrl = (input.baseUrl ?? preset.baseUrl).replace(/\/+$/, '')
  if (!baseUrl) throw invalid('base URL is required for this preset')
  if (!input.model.trim()) throw invalid('model is required')
  if (!preset.kinds.includes(input.kind)) {
    throw invalid(`${input.preset} does not provide ${input.kind}`)
  }
  const urlCheck = checkProviderUrl(baseUrl)
  if (!urlCheck.ok) throw invalid(urlCheck.reason)
  try {
    await assertPublicProviderHost(baseUrl)
  } catch (error) {
    throw invalid((error as Error).message)
  }
  const dim = input.kind === 'embedding' ? (input.dim ?? preset.defaultDim ?? null) : null
  const apiKey = input.apiKey?.trim() ? input.apiKey.trim() : null

  const row = await withUser(input.userId, async (tx) => {
    if (input.isDefault) {
      await tx.query(
        'update providers set is_default = false where user_id = $1 and kind = $2 and is_default',
        [input.userId, input.kind],
      )
    }
    const { rows } = await tx.query<Row>(
      `insert into providers
         (user_id, kind, preset, label, base_url, model, api_key_enc, api_key_hint, dim, is_default)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning *`,
      [
        input.userId,
        input.kind,
        input.preset,
        input.label,
        baseUrl,
        input.model,
        apiKey ? encrypt(keyEncryptionKey(), apiKey) : null,
        apiKey ? hintFor(apiKey) : null,
        dim,
        input.isDefault ?? false,
      ],
    )
    return rows[0] as Row
  })

  await audit({
    actorType: 'user',
    actorId: input.userId,
    action: 'provider.create',
    targetType: 'provider',
    targetId: row.id,
    detail: { kind: row.kind, preset: row.preset, label: row.label, configured: row.api_key_enc !== null },
  })

  return toSummary(row)
}

export async function listProviders(
  userId: string,
  kind?: ProviderKind,
): Promise<ProviderSummary[]> {
  const rows = await withUser(userId, async (tx) => {
    const { rows } = await tx.query<Row>(
      `select * from providers
        where user_id = $1 and ($2::provider_kind is null or kind = $2)
        order by is_default desc, created_at`,
      [userId, kind ?? null],
    )
    return rows
  })
  return rows.map(toSummary)
}

/**
 * Idempotent: a provider the caller cannot see is simply not deleted, and the
 * caller learns nothing about whether it exists.
 */
export async function deleteProvider(userId: string, id: string): Promise<void> {
  const gone = await withUser(userId, async (tx) => {
    // Read the identity before the row disappears: afterwards the id points at nothing.
    const { rows } = await tx.query<{ kind: ProviderKind; preset: string; label: string }>(
      'delete from providers where id = $1 returning kind, preset, label',
      [id],
    )
    return rows[0] ?? null
  })
  if (gone) {
    await audit({
      actorType: 'user',
      actorId: userId,
      action: 'provider.delete',
      targetType: 'provider',
      targetId: id,
      detail: { kind: gone.kind, preset: gone.preset, label: gone.label },
    })
  }
}

export async function setDefaultProvider(userId: string, id: string): Promise<void> {
  await withUser(userId, async (tx) => {
    const current = await tx.query<{ kind: ProviderKind }>(
      'select kind from providers where id = $1',
      [id],
    )
    const row = current.rows[0]
    if (!row) throw notFound()
    await tx.query(
      'update providers set is_default = false where user_id = $1 and kind = $2 and is_default and id <> $3',
      [userId, row.kind, id],
    )
    await tx.query('update providers set is_default = true where id = $1', [id])
  })
}

/** Records the outcome of a connection probe. Scoped by user_id, so it cannot touch another user's row. */
export async function recordVerification(userId: string, id: string, error: string | null): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(
      `update providers
          set last_verified_at = case when $3::text is null then now() else last_verified_at end,
              last_error = $3
        where id = $1 and user_id = $2`,
      [id, userId, error],
    )
  })
}

/** Plaintext, for the provider client only. Never hand this to a page. */
export async function getProviderSecret(userId: string, id: string): Promise<ProviderSecret> {
  const row = await withUser(userId, async (tx) => {
    const { rows } = await tx.query<Row>('select * from providers where id = $1', [id])
    return rows[0]
  })
  if (!row) throw notFound()
  return {
    id: row.id,
    baseUrl: row.base_url,
    model: row.model,
    // The column is text; every write path validates it against PRESETS.
    preset: row.preset as PresetId,
    kind: row.kind,
    dim: row.dim,
    apiKey: row.api_key_enc ? decrypt(keyEncryptionKey(), row.api_key_enc) : null,
  }
}
