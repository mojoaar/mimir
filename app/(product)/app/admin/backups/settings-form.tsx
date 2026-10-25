'use client'

import { useState } from 'react'
import { saveBackupSettingsAction } from './actions'

type Settings = {
  enabled: boolean
  schedule: string
  retention: number
  target: 's3' | 'webdav' | null
}
type S3 = {
  bucket: string
  endpoint: string
  region: string
  prefix: string
  pathStyle: boolean
  keyHighlight: string
}
type WebDav = { baseUrl: string; username: string; prefix: string }

const FIELD = 'w-full rounded border px-3 py-2 text-sm'
const FIELD_STYLE = {
  borderColor: 'var(--border)',
  background: 'var(--bg)',
  color: 'var(--fg)',
}

export function BackupForm({
  settings,
  hasS3,
  hasWebDav,
  s3,
  webdav,
}: {
  settings: Settings
  hasS3: boolean
  hasWebDav: boolean
  s3: S3 | null
  webdav: WebDav | null
}) {
  const [target, setTarget] = useState<string>(settings.target ?? 's3')

  return (
    <form
      action={saveBackupSettingsAction}
      className="flex flex-col gap-4 rounded-lg border p-4"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-raised)' }}
    >
      <h2 className="text-lg font-medium">Where and when</h2>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="enabled" defaultChecked={settings.enabled} />
          Run on a schedule
        </label>
        <label className="flex items-center gap-2">
          <span className="text-[var(--text-muted)]">Cron</span>
          <input
            name="schedule"
            defaultValue={settings.schedule}
            className={`${FIELD} w-40`}
            style={FIELD_STYLE}
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-[var(--text-muted)]">Keep</span>
          <input
            name="retention"
            type="number"
            min={1}
            defaultValue={settings.retention}
            className={`${FIELD} w-20`}
            style={FIELD_STYLE}
          />
          <span className="text-[var(--text-muted)]">runs</span>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--text-muted)]">Target</span>
        <select
          name="target"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          className={FIELD}
          style={FIELD_STYLE}
        >
          <option value="s3">S3 bucket</option>
          <option value="webdav">WebDAV (pCloud)</option>
          <option value="none">No target</option>
        </select>
      </label>

      {target === 's3' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-muted)]">Bucket</span>
            <input name="s3Bucket" defaultValue={s3?.bucket ?? ''} className={FIELD} style={FIELD_STYLE} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-muted)]">Endpoint</span>
            <input
              name="s3Endpoint"
              defaultValue={s3?.endpoint ?? 'https://s3.amazonaws.com'}
              className={FIELD}
              style={FIELD_STYLE}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-muted)]">Region</span>
            <input name="s3Region" defaultValue={s3?.region ?? 'us-east-1'} className={FIELD} style={FIELD_STYLE} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-muted)]">Prefix</span>
            <input name="s3Prefix" defaultValue={s3?.prefix ?? 'mimir'} className={FIELD} style={FIELD_STYLE} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-muted)]">Access key id</span>
            <input
              name="s3AccessKeyId"
              defaultValue={s3?.keyHighlight ?? ''}
              autoComplete="off"
              className={FIELD}
              style={FIELD_STYLE}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-muted)]">
              Secret{hasS3 ? ' (leave blank to keep the stored one)' : ''}
            </span>
            <input name="s3Secret" type="password" autoComplete="off" className={FIELD} style={FIELD_STYLE} />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="s3PathStyle" defaultChecked={s3?.pathStyle ?? false} />
            Path-style requests (MinIO and some S3-compatible hosts)
          </label>
        </div>
      ) : null}

      {target === 'webdav' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-[var(--text-muted)]">Base URL</span>
            <input
              name="webdavUrl"
              defaultValue={webdav?.baseUrl ?? 'https://webdav.pcloud.com'}
              className={FIELD}
              style={FIELD_STYLE}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-muted)]">Username</span>
            <input name="webdavUser" defaultValue={webdav?.username ?? ''} className={FIELD} style={FIELD_STYLE} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-muted)]">
              Password{hasWebDav ? ' (leave blank to keep the stored one)' : ''}
            </span>
            <input name="webdavPassword" type="password" autoComplete="off" className={FIELD} style={FIELD_STYLE} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-muted)]">Prefix</span>
            <input name="webdavPrefix" defaultValue={webdav?.prefix ?? 'mimir'} className={FIELD} style={FIELD_STYLE} />
          </label>
        </div>
      ) : null}

      <div>
        <button
          type="submit"
          className="rounded px-4 py-2 text-sm font-medium"
          style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
        >
          Save
        </button>
      </div>
    </form>
  )
}
