import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/admin'
import { withAdmin } from '@/lib/db/tx'
import {
  getBackupSettings,
  getS3Credentials,
  getWebDavCredentials,
} from '@/lib/settings/backup-settings'
import { BackupForm } from './settings-form'
import { runBackupAction } from './actions'

export const instant = false

type Run = {
  id: string
  started_at: Date
  status: string
  target: string
  size_bytes: string | null
  error: string | null
  triggered_by: string
}

const HOUR = 60 * 60 * 1000

function describeAge(when: Date | null): { text: string; stale: boolean } {
  if (!when) return { text: 'Never', stale: true }
  const hours = Math.floor((Date.now() - when.getTime()) / HOUR)
  const text = hours < 1 ? 'under an hour ago' : `${hours} hour${hours === 1 ? '' : 's'} ago`
  return { text, stale: hours > 26 }
}

export default async function BackupsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>
}) {
  await requireAdmin()
  const params = await searchParams

  const [settings, s3, webdav, runs] = await Promise.all([
    getBackupSettings(),
    getS3Credentials(),
    getWebDavCredentials(),
    withAdmin((client) =>
      client.query<Run>(
        `select id, started_at, status, target, size_bytes, error, triggered_by
           from backup_runs order by started_at desc limit 20`,
      ),
    ),
  ])

  const latestOk = await withAdmin((client) =>
    client.query<{ finished_at: Date | null }>(
      `select finished_at from backup_runs where status = 'ok' order by finished_at desc limit 1`,
    ),
  )
  const age = describeAge(latestOk.rows[0]?.finished_at ?? null)

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Backups</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Encrypted with <code>MIMIR_SECRET</code>. A run is only recorded as successful once every
          object has been read back at the size that was uploaded.
        </p>
      </section>

      {params.notice ? (
        <p className="text-sm text-[var(--accent)]">{params.notice}</p>
      ) : null}
      {params.error ? <p className="text-sm text-[var(--danger)]">{params.error}</p> : null}

      <section
        className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-raised)' }}
      >
        <div className="text-sm">
          <p className="font-medium">
            Last successful run:{' '}
            <span style={{ color: age.stale ? 'var(--danger)' : 'var(--fg)' }}>{age.text}</span>
          </p>
          <p className="text-[var(--text-muted)]">
            {settings.enabled
              ? `Scheduled ${settings.schedule}, keeping the newest ${settings.retention} runs.`
              : 'Scheduled backups are off.'}
          </p>
        </div>
        <form action={runBackupAction}>
          <button
            type="submit"
            className="rounded px-4 py-2 text-sm font-medium"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
          >
            Run now
          </button>
        </form>
      </section>

      <BackupForm
        settings={settings}
        hasS3={s3 !== null}
        hasWebDav={webdav !== null}
        s3={
          s3
            ? {
                bucket: s3.bucket,
                endpoint: s3.endpoint,
                region: s3.region,
                prefix: s3.prefix,
                pathStyle: s3.pathStyle,
                // Never prefill the credential: a truncated value would be saved as-is.
                keyHighlight: '',
              }
            : null
        }
        webdav={webdav ? { baseUrl: webdav.baseUrl, username: webdav.username, prefix: webdav.prefix } : null}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Recent runs</h2>
        {runs.rows.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No runs yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {runs.rows.map((run) => (
              <li
                key={run.id}
                className="rounded border p-3 text-sm"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className="font-medium"
                    style={{ color: run.status === 'ok' ? 'var(--fg)' : 'var(--danger)' }}
                  >
                    {run.status} · {run.target} · {run.triggered_by}
                  </span>
                  <span className="text-[var(--text-muted)]">
                    {new Date(run.started_at).toISOString().replace('T', ' ').slice(0, 16)} UTC
                    {run.size_bytes ? ` · ${(Number(run.size_bytes) / 1024).toFixed(1)} KB` : ''}
                  </span>
                </div>
                {run.error ? (
                  <p className="mt-1 break-words" style={{ color: 'var(--danger)' }}>
                    {run.error}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-sm text-[var(--text-muted)]">
        Restoring is a command, not a button: see <code>scripts/restore.sh</code>.{' '}
        <Link href="/app/admin" className="underline">
          Back to overview
        </Link>
      </p>
    </main>
  )
}
