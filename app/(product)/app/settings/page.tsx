import { requireUser } from '@/lib/auth/context'
import { listApiKeys } from '@/lib/auth/apikey'
import { getConfig } from '@/lib/config'
import { KeyForm, KeyList } from './key-form'

export const instant = false

export default async function SettingsPage() {
  const user = await requireUser()
  const keys = await listApiKeys(user.id)
  const base = getConfig().publicUrlSeed?.replace(/\/$/, '') ?? 'http://localhost:3000'

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">API keys</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Agents authenticate to <code>{base}/mcp</code> and <code>{base}/api/v1</code> with a bearer
          token. Keys are hashed at rest and cannot be recovered.
        </p>
        <KeyForm />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Your keys</h2>
        <KeyList keys={keys} />
      </section>
    </main>
  )
}
