import { requireUser } from '@/lib/auth/context'
import { listProviders, type ProviderSummary } from '@/lib/providers/service'
import { ProviderForm } from './provider-form'
import { deleteProviderAction, setDefaultAction, verifyProviderAction } from './actions'

export const instant = false

const secondary =
  'rounded border border-[var(--border)] px-2 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'

function Card({ provider }: { provider: ProviderSummary }) {
  const verified = provider.lastVerifiedAt
    ? `tested ${new Date(provider.lastVerifiedAt).toLocaleDateString()}`
    : 'not tested yet'

  return (
    <li className="space-y-2 rounded border border-[var(--border)] bg-[var(--bg-raised)] p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{provider.label}</span>
        <code className="text-[var(--text-muted)]">{provider.preset}</code>
        {provider.isDefault && (
          <span className="rounded bg-[var(--accent)] px-2 py-0.5 text-xs text-[var(--accent-fg)]">
            default
          </span>
        )}
      </div>

      <div className="text-[var(--text-muted)]">
        {provider.model} · {provider.baseUrl}
        {provider.dim !== null && ` · ${provider.dim} dims`}
      </div>

      <div className="text-[var(--text-muted)]">
        key {provider.hasKey ? <code>{provider.keyHint}</code> : 'not set'} · {verified}
      </div>

      {provider.lastError && (
        <p className="text-[var(--danger)]">last error: {provider.lastError}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <form action={verifyProviderAction}>
          <input type="hidden" name="id" value={provider.id} />
          <button type="submit" className={secondary}>
            Test
          </button>
        </form>
        {!provider.isDefault && (
          <form action={setDefaultAction}>
            <input type="hidden" name="id" value={provider.id} />
            <button type="submit" className={secondary}>
              Set default
            </button>
          </form>
        )}
        <form action={deleteProviderAction}>
          <input type="hidden" name="id" value={provider.id} />
          <button type="submit" className="text-xs text-[var(--danger)] underline">
            Delete
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
}: {
  title: string
  note?: string
  providers: ProviderSummary[]
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{title}</h2>
      {note && <p className="text-sm text-[var(--text-muted)]">{note}</p>}
      {providers.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">Nothing configured yet.</p>
      ) : (
        <ul className="space-y-2">
          {providers.map((p) => (
            <Card key={p.id} provider={p} />
          ))}
        </ul>
      )}
    </section>
  )
}

export default async function ProvidersPage() {
  const user = await requireUser()
  const providers = await listProviders(user.id)

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">Providers</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Your keys are yours: extraction uses the key of whoever owns the project, so a project
          shared with you never spends your credit and never sends your content anywhere.
        </p>
      </section>

      <Section
        title="Language models"
        note="Used to extract a title and a summary from a written memory. Without one, memories are stored as written and still searchable."
        providers={providers.filter((p) => p.kind === 'llm')}
      />

      <Section
        title="Embeddings"
        note="Embeddings are configured once for the whole installation by an admin. Here you can save the key, but the model is chosen in Admin settings."
        providers={providers.filter((p) => p.kind === 'embedding')}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Add a provider</h2>
        <ProviderForm />
      </section>
    </main>
  )
}
