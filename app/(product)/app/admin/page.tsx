import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/admin'
import { withAdmin } from '@/lib/db/tx'

export const instant = false

type Stats = {
  activeUsers: number
  pendingUsers: number
  disabledUsers: number
  projects: number
  memories: number
  embedded: number
  lastBackupAt: Date | null
  lastBackupStatus: string | null
  jobsActive: number
  jobsFailed: number
}

async function getStats(): Promise<Stats> {
  return withAdmin(async (client) => {
    const users = await client.query<{ status: string; count: string }>(
      `select status, count(*) from users group by status`,
    )
    const counts = new Map(users.rows.map((row) => [row.status, Number(row.count)]))

    const tables = await client.query<{ projects: string; memories: string; embedded: string }>(
      `select (select count(*) from projects) as projects,
              (select count(*) from memories where deleted_at is null) as memories,
              (select count(*) from memories where deleted_at is null and embedding is not null) as embedded`,
    )
    const row = tables.rows[0]

    const backup = await client.query<{ finished_at: Date | null; status: string }>(
      `select finished_at, status from backup_runs order by started_at desc limit 1`,
    )

    // pg-boss keeps its own schema; a missing schema simply means no jobs yet.
    const jobs = await client
      .query<{ active: string; failed: string }>(
        `select count(*) filter (where state = 'active') as active,
                count(*) filter (where state = 'failed') as failed
           from pgboss.job`,
      )
      .catch(() => ({ rows: [{ active: '0', failed: '0' }] }))

    return {
      activeUsers: counts.get('active') ?? 0,
      pendingUsers: counts.get('pending') ?? 0,
      disabledUsers: counts.get('disabled') ?? 0,
      projects: Number(row?.projects ?? 0),
      memories: Number(row?.memories ?? 0),
      embedded: Number(row?.embedded ?? 0),
      lastBackupAt: backup.rows[0]?.finished_at ?? null,
      lastBackupStatus: backup.rows[0]?.status ?? null,
      jobsActive: Number(jobs.rows[0]?.active ?? 0),
      jobsFailed: Number(jobs.rows[0]?.failed ?? 0),
    }
  })
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-raised)' }}
    >
      <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint ? <p className="text-xs text-[var(--text-muted)]">{hint}</p> : null}
    </div>
  )
}

export default async function AdminOverviewPage() {
  await requireAdmin()
  const stats = await getStats()
  const embeddedPercent =
    stats.memories === 0 ? 100 : Math.round((stats.embedded / stats.memories) * 100)
  const lastBackup = stats.lastBackupAt
    ? `${stats.lastBackupAt.toISOString().replace('T', ' ').slice(0, 16)} UTC (${stats.lastBackupStatus})`
    : 'Never'

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold">Overview</h1>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label="Users"
          value={String(stats.activeUsers)}
          hint={`${stats.pendingUsers} pending · ${stats.disabledUsers} disabled`}
        />
        <Stat label="Projects" value={String(stats.projects)} />
        <Stat
          label="Memories"
          value={String(stats.memories)}
          hint={`${embeddedPercent}% embedded`}
        />
        <Stat label="Last backup" value={stats.lastBackupAt ? 'Done' : 'Never'} hint={lastBackup} />
        <Stat
          label="Jobs"
          value={String(stats.jobsActive)}
          hint={`${stats.jobsFailed} failed`}
        />
      </section>

      <nav className="flex flex-wrap gap-4 text-sm">
        <Link href="/app/admin/users" className="underline">
          Users
        </Link>
        <Link href="/app/admin/backups" className="underline">
          Backups
        </Link>
        <Link href="/app/admin/audit" className="underline">
          Audit log
        </Link>
        <Link href="/app/admin/settings" className="underline">
          Embeddings
        </Link>
        <Link href="/app/admin/settings/site" className="underline">
          Site settings
        </Link>
      </nav>
    </main>
  )
}
