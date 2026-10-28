import { getBackupSettings, getS3Credentials, getWebDavCredentials } from '@/lib/settings/backup-settings'
import { s3Storage } from './s3'
import { webDavStorage } from './webdav'

export interface Storage {
  put(key: string, body: Buffer): Promise<void>
  head(key: string): Promise<{ size: number } | null>
  list(prefix: string): Promise<{ key: string; size: number }[]>
  remove(key: string): Promise<void>
}

export type StorageTarget = { storage: Storage; prefix: string }

const ARTIFACT = /^(mimir-\d{8}-\d{6}\.dump\.enc|settings-\d{8}-\d{6}\.json\.enc)$/

export function isArtifactKey(key: string): boolean {
  return ARTIFACT.test(key.slice(key.lastIndexOf('/') + 1))
}

export async function storageFromSettings(): Promise<StorageTarget | null> {
  const settings = await getBackupSettings()
  if (settings.target === 's3') {
    const config = await getS3Credentials()
    return config ? { storage: s3Storage(config), prefix: config.prefix } : null
  }
  if (settings.target === 'webdav') {
    const config = await getWebDavCredentials()
    return config ? { storage: webDavStorage(config), prefix: config.prefix } : null
  }
  return null
}

const STAMP = /(\d{8}-\d{6})/

/**
 * Retention counts RESTORE POINTS, not files: one run writes a dump and a
 * settings export under the same stamp, and both survive or go together.
 * Sorting the files would work only if their names interleaved, and they do
 * not - every `mimir-` name sorts before every `settings-` name.
 * Anything that is not one of our two artefacts is left alone, including a
 * dump an operator put there by hand.
 */
export async function pruneOldBackups(storage: Storage, prefix: string, keep: number): Promise<string[]> {
  const listed = await storage.list(prefix)
  const runs = new Map<string, string[]>()
  for (const entry of listed) {
    const name = entry.key.slice(entry.key.lastIndexOf('/') + 1)
    if (!isArtifactKey(name)) continue
    const stamp = STAMP.exec(name)?.[1]
    if (!stamp) continue
    runs.set(stamp, [...(runs.get(stamp) ?? []), entry.key])
  }

  const stamps = [...runs.keys()].sort()
  const excess = stamps.slice(0, Math.max(0, stamps.length - keep))
  const removed: string[] = []
  for (const stamp of excess) {
    for (const key of runs.get(stamp) ?? []) {
      await storage.remove(key)
      removed.push(key)
    }
  }
  return removed
}
