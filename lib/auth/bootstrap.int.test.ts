import { beforeEach, describe, expect, it } from 'vitest'
import { getConfig } from '@/lib/config'
import { resetFixtures } from '@/lib/db/seed'
import { adminPool } from '@/lib/db/pool'
import { ensureBootstrapAdmin } from './bootstrap'

const cfg = getConfig()

beforeEach(async () => {
  await resetFixtures()
})

describe('ensureBootstrapAdmin', () => {
  it('creates the admin on an empty install', async () => {
    await ensureBootstrapAdmin({ ...cfg, adminEmail: 'a@b.c', adminPassword: 'hunter2hunter2' })
    const { rows } = await adminPool().query('select role, status from users')
    expect(rows).toEqual([{ role: 'admin', status: 'active' }])
  })

  it('never touches an existing user', async () => {
    await ensureBootstrapAdmin({ ...cfg, adminEmail: 'a@b.c', adminPassword: 'hunter2hunter2' })
    await ensureBootstrapAdmin({ ...cfg, adminEmail: 'other@b.c', adminPassword: 'different-password' })
    const { rows } = await adminPool().query('select email from users')
    expect(rows).toEqual([{ email: 'a@b.c' }])
  })

  it('logs and skips when the env vars are absent', async () => {
    const messages: string[] = []
    await ensureBootstrapAdmin({ ...cfg, adminEmail: null, adminPassword: null }, (m) => messages.push(m))
    expect(messages.join('\n')).toMatch(/MIMIR_ADMIN_EMAIL/)
  })
})
