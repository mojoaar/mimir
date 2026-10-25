import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminPool, closePools } from '@/lib/db/pool'
import { resetFixtures, seedTwoUsersWithProjects } from '@/lib/db/seed'
import type { Storage } from './storage'

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
}))

vi.mock('@/lib/email/client', () => ({ sendEmail: mocks.sendEmail }))

type Call = { op: string; key: string; size?: number }

function fakeStorage(overrides: { headSize?: number; failPut?: boolean } = {}) {
  const calls: Call[] = []
  const storage: Storage = {
    async put(key, body) {
      calls.push({ op: 'put', key, size: body.length })
      if (overrides.failPut) throw new Error('upload refused')
    },
    async head(key) {
      calls.push({ op: 'head', key })
      const size = overrides.headSize ?? calls.filter((c) => c.op === 'put').at(-1)?.size ?? 0
      return { size }
    },
    async list() {
      return []
    },
    async remove(key) {
      calls.push({ op: 'remove', key })
    },
  }
  return { storage, calls }
}

const ARTIFACTS = [
  { name: 'mimir-20261026-030000.dump.enc', body: Buffer.alloc(100, 1) },
  { name: 'settings-20261026-030000.json.enc', body: Buffer.alloc(20, 2) },
]

async function runs() {
  const { rows } = await adminPool().query(
    `select status, target, object_key, size_bytes::int as size_bytes, error, triggered_by
       from backup_runs order by started_at desc`,
  )
  return rows
}

async function audits() {
  const { rows } = await adminPool().query(
    `select action, detail from audit_log where action = 'backup.run' order by id desc`,
  )
  return rows
}

describe('runBackup', () => {
  beforeEach(async () => {
    await resetFixtures()
    await seedTwoUsersWithProjects()
    mocks.sendEmail.mockReset()
    mocks.sendEmail.mockResolvedValue({ ok: true })
  })

  it('uploads both artifacts, verifies them and records the run', async () => {
    const { storage, calls } = fakeStorage()
    const { runBackup } = await import('./run')

    const result = await runBackup({ triggeredBy: 'manual' }, { storage, artifacts: ARTIFACTS })

    expect(result.ok).toBe(true)
    expect(result.bytes).toBe(120)
    expect(calls.filter((c) => c.op === 'put').map((c) => c.key)).toEqual([
      'mimir-20261026-030000.dump.enc',
      'settings-20261026-030000.json.enc',
    ])
    expect(calls.filter((c) => c.op === 'head')).toHaveLength(2)

    const [row] = await runs()
    expect(row).toMatchObject({
      status: 'ok',
      object_key: 'mimir-20261026-030000.dump.enc',
      size_bytes: 120,
      triggered_by: 'manual',
    })
    const [auditRow] = await audits()
    expect(auditRow?.detail).toMatchObject({ ok: true, bytes: 120 })
  })

  it('fails when the stored object is not the size that was uploaded', async () => {
    const { storage } = fakeStorage({ headSize: 99 })
    const { runBackup } = await import('./run')

    const result = await runBackup({ triggeredBy: 'schedule' }, { storage, artifacts: ARTIFACTS })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('99')
    const [row] = await runs()
    expect(row?.status).toBe('failed')
    expect(row?.error).toContain('99')
    const [auditRow] = await audits()
    expect(auditRow?.detail).toMatchObject({ ok: false })
  })

  it('fails the run and tells the admins when the upload throws', async () => {
    const { storage } = fakeStorage({ failPut: true })
    const { runBackup } = await import('./run')

    const result = await runBackup({ triggeredBy: 'schedule' }, { storage, artifacts: ARTIFACTS })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('upload refused')
    // One active admin in the fixtures.
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)
    const [row] = await runs()
    expect(row?.status).toBe('failed')
  })

  it('leaves an earlier successful run alone when a later one fails', async () => {
    const good = fakeStorage()
    const bad = fakeStorage({ failPut: true })
    const { runBackup } = await import('./run')

    await runBackup({ triggeredBy: 'schedule' }, { storage: good.storage, artifacts: ARTIFACTS })
    await runBackup({ triggeredBy: 'schedule' }, { storage: bad.storage, artifacts: ARTIFACTS })

    const rows = await runs()
    expect(rows.map((row) => row.status)).toEqual(['failed', 'ok'])
  })
})

afterAll(async () => {
  await closePools()
})
