import { requireUser } from '@/lib/auth/context'
import { translator } from '@/lib/i18n/request'
import { listProviders, type ProviderSummary } from '@/lib/providers/service'
import { ProviderForm } from './provider-form'
import { deleteProviderAction, setDefaultAction, verifyProviderAction } from './actions'

export const instant = false

const secondary =
  'rounded border border-[var(--border)] px-2 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'

type Translate = (key: string, vars?: Record<string, string | number>) => string

function Card({ provider, t }: { provider: ProviderSummary; t: Translate }) {
  const verified = provider.lastVerifiedAt
    ? t('app.providers.tested', {
        date: new Date(provider.lastVerifiedAt).toLocaleDateString(),
      })
    : t('app.providers.notTested')

  return (
    <li className="space-y-2 rounded border border-[var(--border)] bg-[var(--bg-raised)] p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{provider.label}</span>
        <code className="text-[var(--text-muted)]">{provider.preset}</code>
        {provider.isDefault && (
          <span className="rounded bg-[var(--accent)] px-2 py-0.5 text-xs text-[var(--accent-fg)]">
            {t('app.providers.default')}
          </span>
        )}
      </div>

      <div className="text-[var(--text-muted)]">
        {provider.model} · {provider.baseUrl}
        {provider.dim !== null && ` · ${t('app.providers.dims', { count: provider.dim })}`}
      </div>

      <div className="text-[var(--text-muted)]">
        {provider.hasKey && provider.keyHint
          ? t('app.providers.keySet', { hint: provider.keyHint })
          : t('app.providers.keyMissing')}{' '}
        · {verified}
      </div>

      {provider.lastError && (
        <p className="text-[var(--danger)]">
          {t('app.providers.lastError', { message: provider.lastError })}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <form action={verifyProviderAction}>
          <input type="hidden" name="id" value={provider.id} />
          <button type="submit" className={secondary}>
            {t('app.providers.test')}
          </button>
        </form>
        {!provider.isDefault && (
          <form action={setDefaultAction}>
            <input type="hidden" name="id" value={provider.id} />
            <button type="submit" className={secondary}>
              {t('app.providers.setDefault')}
            </button>
          </form>
        )}
        <form action={deleteProviderAction}>
          <input type="hidden" name="id" value={provider.id} />
          <button type="submit" className="text-xs text-[var(--danger)] underline">
            {t('app.providers.delete')}
          </button>
        </form>
      </div>
    </li>
  )
}

function Section({
  title,
  note,
  providers,
  t,
}: {
  title: string
  note?: string
  providers: ProviderSummary[]
  t: Translate
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{title}</h2>
      {note && <p className="text-sm text-[var(--text-muted)]">{note}</p>}
      {providers.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">{t('app.providers.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {providers.map((p) => (
            <Card key={p.id} provider={p} t={t} />
          ))}
        </ul>
      )}
    </section>
  )
}

export default async function ProvidersPage() {
  const user = await requireUser()
  const t = await translator()
  const providers = await listProviders(user.id)

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('app.providers.title')}</h1>
        <p className="text-sm text-[var(--text-muted)]">{t('app.providers.intro')}</p>
      </section>

      <Section
        title={t('app.providers.llmTitle')}
        note={t('app.providers.llmNote')}
        providers={providers.filter((p) => p.kind === 'llm')}
        t={t}
      />

      <Section
        title={t('app.providers.embeddingTitle')}
        note={t('app.providers.embeddingNote')}
        providers={providers.filter((p) => p.kind === 'embedding')}
        t={t}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">{t('app.providers.add')}</h2>
        <ProviderForm
          labels={{
            provider: t('app.providers.fieldProvider'),
            kind: t('app.providers.fieldKind'),
            kindLlm: t('app.providers.kindLlm'),
            kindEmbedding: t('app.providers.kindEmbedding'),
            label: t('app.providers.fieldLabel'),
            labelPlaceholder: t('app.providers.labelPlaceholder'),
            model: t('app.providers.fieldModel'),
            baseUrl: t('app.providers.fieldBaseUrl'),
            baseUrlHint: t('app.providers.baseUrlHint'),
            apiKey: t('app.providers.fieldKey'),
            apiKeyHint: t('app.providers.keyHint'),
            makeDefault: t('app.providers.makeDefault'),
            save: t('app.providers.save'),
            saving: t('app.providers.saving'),
            saved: t('app.providers.saved'),
          }}
        />
      </section>
    </main>
  )
}
