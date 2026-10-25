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

/**
 * Retention is by name, not by listing date, so a restore point is deleted only
 * after a newer one exists. Anything that is not one of our two artefacts is
 * left alone, including a dump an operator put there by hand.
 */
export async function pruneOldBackups(storage: Storage, prefix: string, keep: number): Promise<string[]> {
  const listed = await storage.list(prefix)
  const artifacts = listed.filter((entry) => isArtifactKey(entry.key)).sort((a, b) => (a.key < b.key ? -1 : 1))
  const excess = artifacts.slice(0, Math.max(0, artifacts.length - keep))
  for (const entry of excess) {
    await storage.remove(entry.key)
  }
  return excess.map((entry) => entry.key)
}
