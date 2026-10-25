import { requireAdmin } from '@/lib/auth/admin'
import { listProviders } from '@/lib/providers/service'
import { getEmbeddingConfig } from '@/lib/settings/embedding'
import { EmbeddingForm } from './embedding-form'

export const instant = false

export default async function AdminSettingsPage() {
  const user = await requireAdmin()
  const [config, providers] = await Promise.all([
    getEmbeddingConfig(),
    listProviders(user.id, 'embedding'),
  ])

  const current = config
    ? providers.find((p) => p.id === config.providerId)
    : undefined

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">Embeddings</h1>
        <p className="text-sm text-[var(--text-muted)]">
          One embedding model serves the whole installation, because the vector column has a fixed
          size and vectors from two different models are not comparable. Changing it later means
          re-embedding every memory.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Current</h2>
        {config ? (
          <p className="text-sm">
            <span className="font-medium">{current?.label ?? 'a provider you cannot see'}</span>{' '}
            <code className="text-[var(--text-muted)]">
              {config.model} · {config.dim} dims
            </code>
          </p>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            Not configured. Memories are stored and keyword-searchable; nothing is embedded.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Choose a model</h2>
        <EmbeddingForm
          providers={providers.map((p) => ({ id: p.id, label: p.label, model: p.model }))}
        />
      </section>
    </main>
  )
}
