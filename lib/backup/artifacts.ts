import { decryptBytes, deriveKey, encryptBytes } from '@/lib/crypto'
import { getConfig } from '@/lib/config'
import { buildSettingsExport } from './settings-export'
import { dumpDatabase, type DumpRunner } from './dump'

export type Artifact = { name: string; body: Buffer }

const INFO = 'mimir/backup'

export function backupKey(): Buffer {
  return deriveKey(getConfig().secret, INFO)
}

function stamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  )
}

/**
 * Both artifacts are namespaced with the same timestamp so a restore can be
 * made from one moment rather than two that are hours apart.
 */
export async function buildBackupArtifacts(
  deps: { now?: Date; dump?: DumpRunner } = {},
): Promise<Artifact[]> {
  const at = deps.now ?? new Date()
  const key = backupKey()
  const dump = await dumpDatabase(getConfig().databaseAdminUrl, { runner: deps.dump })
  const settings = Buffer.from(JSON.stringify(await buildSettingsExport(), null, 2), 'utf8')
  const name = stamp(at)
  return [
    { name: `mimir-${name}.dump.enc`, body: encryptBytes(key, dump) },
    { name: `settings-${name}.json.enc`, body: encryptBytes(key, settings) },
  ]
}

export function decryptArtifact(body: Buffer): Buffer {
  return decryptBytes(backupKey(), body)
}
