import { audit } from '../audit'
import { buildBackupArtifacts, type Artifact } from './artifacts'
import { pruneOldBackups, storageFromSettings, type Storage } from './storage'
import { getBackupSettings } from '../settings/backup-settings'
import { sendEmail } from '../email/client'
import { backupFailureEmail } from '../email/templates'
import { getSiteSettings } from '../settings/site'
import { withAdmin } from '../db/tx'

export type BackupInput = {
  triggeredBy: 'schedule' | 'manual'
  actorId?: string
}

export type BackupResult = {
  ok: boolean
  runId: string
  bytes: number
  error?: string
}

type Deps = { storage?: Storage; artifacts?: Artifact[]; now?: Date }

async function activeAdminEmails(): Promise<string[]> {
  const { rows } = await withAdmin((client) =>
    client.query<{ email: string }>(
      `select email from users where role = 'admin' and status = 'active'`,
    ),
  )
  return rows.map((row) => row.email)
}

/**
 * One backup run: dump, encrypt, upload, verify, prune.
 *
 * A run is only `ok` once every uploaded object has been read back at the size
 * that was sent. Anything less is a `failed` row, because a backup nobody has
 * verified is a guess.
 */
export async function runBackup(input: BackupInput, deps: Deps = {}): Promise<BackupResult> {
  const settings = await getBackupSettings()
  const started = await withAdmin((client) =>
    client.query<{ id: string }>(
      `insert into backup_runs (target, triggered_by)
       values ($1, $2) returning id`,
      [settings.target ?? 'none', input.triggeredBy],
    ),
  )
  const runId = started.rows[0]?.id
  if (!runId) throw new Error('could not record the backup run')

  let bytes = 0
  const uploaded: string[] = []
  let storage: Storage | null = null
  try {
    const target = deps.storage ? { storage: deps.storage, prefix: '' } : await storageFromSettings()
    if (!target) throw new Error('no backup target is configured')
    storage = target.storage

    const artifacts = deps.artifacts ?? (await buildBackupArtifacts({ now: deps.now }))

    for (const artifact of artifacts) {
      await target.storage.put(artifact.name, artifact.body)
      uploaded.push(artifact.name)
      const stored = await target.storage.head(artifact.name)
      if (!stored) throw new Error(`verify failed for ${artifact.name}: nothing was stored`)
      if (stored.size !== artifact.body.length) {
        throw new Error(
          `verify failed for ${artifact.name}: stored ${stored.size} bytes, expected ${artifact.body.length}`,
        )
      }
      bytes += artifact.body.length
    }

    const removed = await pruneOldBackups(target.storage, target.prefix, settings.retention)
    if (removed.length > 0) {
      console.log(`mimir: pruned ${removed.length} old backup object(s)`)
    }

    const dumpKey = artifacts.find((artifact) => artifact.name.endsWith('.dump.enc'))?.name ?? null
    await withAdmin((client) =>
      client.query(
        `update backup_runs
            set status = 'ok', finished_at = now(), object_key = $2, size_bytes = $3
          where id = $1`,
        [runId, dumpKey, bytes],
      ),
    )
    await audit({
      actorType: input.triggeredBy === 'manual' ? 'user' : 'system',
      actorId: input.actorId ?? null,
      action: 'backup.run',
      targetType: 'backup',
      targetId: runId,
      detail: { ok: true, bytes },
    })

    return { ok: true, runId, bytes }
  } catch (thrown) {
    const error = (thrown instanceof Error ? thrown : new Error(String(thrown))).message.slice(0, 500)
    console.error(`mimir: backup failed (${error})`)

    // A failed run must not leave half-verified objects under valid names: an
    // operator restoring "the newest dump" would pick a truncated file.
    for (const key of uploaded) {
      try {
        await storage?.remove(key)
      } catch (cleanup) {
        console.error(`mimir: could not remove ${key} after a failed backup (${String(cleanup)})`)
      }
    }

    await withAdmin((client) =>
      client.query(
        `update backup_runs set status = 'failed', finished_at = now(), error = $2 where id = $1`,
        [runId, error],
      ),
    )
    await audit({
      actorType: input.triggeredBy === 'manual' ? 'user' : 'system',
      actorId: input.actorId ?? null,
      action: 'backup.run',
      targetType: 'backup',
      targetId: runId,
      detail: { ok: false, error },
    })

    // Silence here would be the worst outcome: nobody finds out until the day
    // the backup is needed.
    const site = await getSiteSettings()
    const template = backupFailureEmail({ siteName: site.siteName, error, when: new Date() })
    for (const email of await activeAdminEmails()) {
      await sendEmail({ to: email, subject: template.subject, text: template.text })
    }

    return { ok: false, runId, bytes: 0, error }
  }
}
