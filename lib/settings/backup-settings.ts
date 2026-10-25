import { openValue, sealValue } from './secrets'
import { InvalidSetting, readSetting, writeSetting } from './store'

export type BackupTarget = 's3' | 'webdav'

export type BackupSettings = {
  enabled: boolean
  schedule: string
  retention: number
  target: BackupTarget | null
}

export type S3Credentials = {
  bucket: string
  endpoint: string
  region: string
  prefix: string
  pathStyle: boolean
  accessKeyId: string
  secretAccessKey: string
}

export type WebDavCredentials = {
  baseUrl: string
  username: string
  password: string
  prefix: string
}

const DEFAULTS: BackupSettings = {
  enabled: false,
  schedule: '0 3 * * *',
  retention: 14,
  target: null,
}

export async function getBackupSettings(): Promise<BackupSettings> {
  const stored = await readSetting<Partial<BackupSettings>>('backup_settings')
  return { ...DEFAULTS, ...(stored ?? {}) }
}

export async function setBackupSettings(
  patch: Partial<BackupSettings>,
  updatedBy: string,
): Promise<void> {
  const next = { ...(await getBackupSettings()), ...patch }
  if (!Number.isInteger(next.retention) || next.retention < 1) {
    throw new InvalidSetting('retention must be a whole number of backups, at least 1')
  }
  if (next.schedule.trim() === '') {
    throw new InvalidSetting('the backup schedule must be a five-field cron expression')
  }
  if (next.target !== null && next.target !== 's3' && next.target !== 'webdav') {
    throw new InvalidSetting('the backup target must be s3 or webdav')
  }
  await writeSetting('backup_settings', next, updatedBy)
}

export async function getS3Credentials(): Promise<S3Credentials | null> {
  const stored = await readSetting<unknown>('backup_s3')
  const value = openValue<S3Credentials>(stored)
  return value && value.bucket ? value : null
}

export async function setS3Credentials(
  value: S3Credentials | null,
  updatedBy: string,
): Promise<void> {
  if (value === null) {
    await writeSetting('backup_s3', null, updatedBy)
    return
  }
  if (!value.bucket.trim() || !value.endpoint.trim()) {
    throw new InvalidSetting('an S3 target needs a bucket and an endpoint')
  }
  await writeSetting('backup_s3', sealValue({ ...value, prefix: value.prefix.replace(/^\/+|\/+$/g, '') }), updatedBy)
}

export async function getWebDavCredentials(): Promise<WebDavCredentials | null> {
  const stored = await readSetting<unknown>('backup_webdav')
  const value = openValue<WebDavCredentials>(stored)
  return value && value.baseUrl ? value : null
}

export async function setWebDavCredentials(
  value: WebDavCredentials | null,
  updatedBy: string,
): Promise<void> {
  if (value === null) {
    await writeSetting('backup_webdav', null, updatedBy)
    return
  }
  if (!value.baseUrl.trim()) {
    throw new InvalidSetting('a WebDAV target needs a URL, for example https://webdav.pcloud.com')
  }
  await writeSetting(
    'backup_webdav',
    sealValue({ ...value, prefix: value.prefix.replace(/^\/+|\/+$/g, '') }),
    updatedBy,
  )
}
