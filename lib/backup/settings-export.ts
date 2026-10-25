import { withAdmin } from '@/lib/db/tx'
import pkg from '../../package.json'

export type SettingsExport = {
  version: string
  exportedAt: string
  settings: Record<string, unknown>
  projects: { slug: string; name: string; repoKey: string | null; learningEnabled: boolean }[]
  providers: { label: string; preset: string; kind: string; model: string; baseUrl: string; isDefault: boolean }[]
}

/**
 * A settings artifact has to be useful on a machine that has lost its database,
 * without carrying anything that could be replayed against a provider or a
 * backup target. Sealed values are dropped whole rather than scrubbed: their
 * plaintext never exists in a form this function could inspect.
 */
export async function buildSettingsExport(): Promise<SettingsExport> {
  return withAdmin(async (client) => {
    const settings = await client.query<{ key: string; value: unknown }>(
      'select key, value from settings order by key',
    )
    const projects = await client.query<{
      slug: string
      name: string
      repo_key: string | null
      learning_enabled: boolean
    }>('select slug, name, repo_key, learning_enabled from projects order by slug')
    const providers = await client.query<{
      label: string
      preset: string
      kind: string
      model: string
      base_url: string
      is_default: boolean
    }>('select label, preset, kind, model, base_url, is_default from providers order by label')

    const kept: Record<string, unknown> = {}
    for (const row of settings.rows) {
      if (row.key.startsWith('backup_') && row.key !== 'backup_settings') continue
      if (row.key === 'email_settings') continue
      kept[row.key] = row.value
    }

    return {
      version: pkg.version,
      exportedAt: new Date().toISOString(),
      settings: kept,
      projects: projects.rows.map((row) => ({
        slug: row.slug,
        name: row.name,
        repoKey: row.repo_key,
        learningEnabled: row.learning_enabled,
      })),
      providers: providers.rows.map((row) => ({
        label: row.label,
        preset: row.preset,
        kind: row.kind,
        model: row.model,
        baseUrl: row.base_url,
        isDefault: row.is_default,
      })),
    }
  })
}
