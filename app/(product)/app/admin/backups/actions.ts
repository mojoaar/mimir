'use server'

import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/admin'
import { audit } from '@/lib/audit'
import { sendJob, rescheduleBackups } from '@/lib/jobs/boss'
import {
  setBackupSettings,
  setS3Credentials,
  setWebDavCredentials,
} from '@/lib/settings/backup-settings'
import { translator } from '@/lib/i18n/request'

type Target = 's3' | 'webdav'

function text(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function back(params: string): never {
  redirect(`/app/admin/backups?${params}`)
}

export async function saveBackupSettingsAction(formData: FormData): Promise<void> {
  const user = await requireAdmin()
  const t = await translator()
  const target = text(formData, 'target')

  try {
    if (target !== 's3' && target !== 'webdav') {
      await setBackupSettings({ enabled: false, target: null }, user.id)
    } else {
      await setBackupSettings(
        {
          enabled: text(formData, 'enabled') === 'on',
          schedule: text(formData, 'schedule') || '0 3 * * *',
          retention: Number(text(formData, 'retention') || '14'),
          target: target as Target,
        },
        user.id,
      )
    }

    // Credentials are stored separately and sealed; a blank secret keeps the old one.
    if (target === 's3') {
      const secretAccessKey = text(formData, 's3Secret')
      const existingSecret = await currentS3Secret()
      const existingKeyId = (await currentS3Credentials())?.accessKeyId ?? ''
      // The key id is not a secret but it is also not prefilled, so a blank
      // field means "keep", exactly like the secret. Sending '' would break
      // every later run with a 403.
      const accessKeyId = text(formData, 's3AccessKeyId') || existingKeyId
      if (secretAccessKey || existingSecret) {
        await setS3Credentials(
          {
            bucket: text(formData, 's3Bucket'),
            endpoint: text(formData, 's3Endpoint') || 'https://s3.amazonaws.com',
            region: text(formData, 's3Region') || 'us-east-1',
            prefix: text(formData, 's3Prefix') || 'mimir',
            pathStyle: text(formData, 's3PathStyle') === 'on',
            accessKeyId,
            secretAccessKey: secretAccessKey || (existingSecret as string),
          },
          user.id,
        )
      }
    }

    if (target === 'webdav') {
      const password = text(formData, 'webdavPassword')
      const existing = password ? null : await currentWebDavPassword()
      if (password || existing) {
        await setWebDavCredentials(
          {
            baseUrl: text(formData, 'webdavUrl') || 'https://webdav.pcloud.com',
            username: text(formData, 'webdavUser'),
            password: password || (existing as string),
            prefix: text(formData, 'webdavPrefix') || 'mimir',
          },
          user.id,
        )
      }
    }

    await rescheduleBackups()
    await audit({
      actorType: 'user',
      actorId: user.id,
      action: 'admin.backup_settings',
      targetType: 'setting',
      targetId: 'backup_settings',
      detail: { target, enabled: text(formData, 'enabled') === 'on' },
    })
  } catch (thrown) {
    const message = (thrown instanceof Error ? thrown : new Error(String(thrown))).message
    back(`error=${encodeURIComponent(message)}`)
  }

  back(`notice=${encodeURIComponent(t('app.admin.backups.saved'))}`)
}

export async function runBackupAction(): Promise<void> {
  const user = await requireAdmin()
  const t = await translator()
  const id = await sendJob('backup', {})
  await audit({
    actorType: 'user',
    actorId: user.id,
    action: 'admin.backup_run',
    targetType: 'backup',
    detail: { queued: id !== null },
  })
  back(
    id
      ? `notice=${encodeURIComponent(t('app.admin.backups.queued'))}`
      : `error=${encodeURIComponent(t('app.admin.backups.queueDown'))}`,
  )
}

async function currentS3Credentials() {
  const { getS3Credentials } = await import('@/lib/settings/backup-settings')
  return getS3Credentials()
}

async function currentS3Secret(): Promise<string | null> {
  return (await currentS3Credentials())?.secretAccessKey ?? null
}

async function currentWebDavPassword(): Promise<string | null> {
  const { getWebDavCredentials } = await import('@/lib/settings/backup-settings')
  return (await getWebDavCredentials())?.password ?? null
}
