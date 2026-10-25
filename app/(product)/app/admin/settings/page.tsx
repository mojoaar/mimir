import { requireAdmin } from '@/lib/auth/admin'
import { translator } from '@/lib/i18n/request'
import { listProviders } from '@/lib/providers/service'
import { getEmbeddingConfig } from '@/lib/settings/embedding'
import { EmbeddingForm } from './embedding-form'
import { ReembedForm } from './reembed-form'

export const instant = false

export default async function AdminSettingsPage() {
  const user = await requireAdmin()
  const t = await translator()
  const [config, providers] = await Promise.all([
    getEmbeddingConfig(),
    listProviders(user.id, 'embedding'),
  ])

  const current = config ? providers.find((p) => p.id === config.providerId) : undefined

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('app.admin.embeddings.title')}</h1>
        <p className="text-sm text-[var(--text-muted)]">{t('app.admin.embeddings.intro')}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">{t('app.admin.embeddings.current')}</h2>
        {config ? (
          <p className="text-sm">
            <span className="font-medium">
              {current?.label ?? t('app.admin.embeddings.unseen')}
            </span>{' '}
            <code className="text-[var(--text-muted)]">
              {config.model} ·{' '}
              {t('app.admin.embeddings.dims', { count: config.dim })}
            </code>
          </p>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">{t('app.admin.embeddings.none')}</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">{t('app.admin.embeddings.choose')}</h2>
        <EmbeddingForm
          providers={providers.map((p) => ({ id: p.id, label: p.label, model: p.model }))}
          labels={{
            noProviders: t('app.admin.embeddings.noProviders'),
            provider: t('app.admin.embeddings.provider'),
            model: t('app.admin.embeddings.model'),
            probeNote: t('app.admin.embeddings.probeNote'),
            submit: t('app.admin.embeddings.testSave'),
            pending: t('app.admin.embeddings.testing'),
          }}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">{t('app.admin.embeddings.rebuild')}</h2>
        <ReembedForm
          labels={{
            note: t('app.admin.embeddings.reembedNote'),
            confirm: t('app.admin.embeddings.confirm'),
            submit: t('app.admin.embeddings.reembedStart'),
            pending: t('app.admin.embeddings.reembedQueuing'),
          }}
        />
      </section>
    </main>
  )
}
