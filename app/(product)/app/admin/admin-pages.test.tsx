import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ locale: 'en' }))

vi.mock('@/lib/auth/admin', () => ({
  requireAdmin: async () => ({
    id: 'admin-1',
    email: 'admin@example.test',
    role: 'admin',
    status: 'active',
    locale: mocks.locale,
  }),
}))

vi.mock('@/lib/auth/context', () => ({
  getCurrentUser: async () => ({
    id: 'admin-1',
    email: 'admin@example.test',
    role: 'admin',
    status: 'active',
    locale: mocks.locale,
  }),
}))

vi.mock('@/lib/db/tx', () => ({
  withAdmin: async (run: (client: unknown) => unknown) =>
    run({
      query: async (sql: string) => {
        if (sql.includes('group by status')) return { rows: [{ status: 'active', count: '1' }] }
        if (sql.includes('from projects')) {
          return { rows: [{ projects: '2', memories: '4', embedded: '3' }] }
        }
        if (sql.includes('backup_runs')) return { rows: [] }
        return { rows: [{ active: '0', failed: '0' }] }
      },
    }),
}))

vi.mock('@/lib/usage/service', () => ({
  spend: async () => ({ llmMicros: 300, embeddingMicros: 40, calls: 4, unpriced: 1 }),
  daily: async () => [{ day: '2026-10-25', micros: 340 }],
  hourly: async () => [{ hour: '2026-10-25T10:00', calls: 2 }],
  breakdown: async () => [
    { preset: 'deepseek', model: 'deepseek-flash', kind: 'llm', calls: 3, micros: 300 },
  ],
  people: async () => [{ email: 'alice@example.test', calls: 4, micros: 340 }],
  failures: async () => [
    {
      at: '2026-10-25T10:00:00.000Z',
      preset: 'deepseek',
      model: 'deepseek-flash',
      purpose: 'extract',
      status: 500,
      email: null,
    },
  ],
}))

vi.mock('@/lib/audit/query', () => ({
  listAudit: async () => ({ total: 0, rows: [] }),
}))

vi.mock('@/lib/settings/backup-settings', () => ({
  getBackupSettings: async () => ({ enabled: false, schedule: '0 3 * * *', retention: 14, target: null }),
  getS3Credentials: async () => null,
  getWebDavCredentials: async () => null,
}))

vi.mock('@/lib/settings/site', () => ({
  getSiteSettings: async () => ({
    siteName: 'Mimir',
    publicUrl: 'http://localhost:3000',
    metaDescription: '',
  }),
}))

vi.mock('@/lib/settings/security', () => ({
  getRequireMfa: async () => false,
  getIpAllowlist: async () => [],
}))

vi.mock('@/lib/settings/email-settings', () => ({
  getEmailSettings: async () => null,
}))

vi.mock('@/lib/config', () => ({
  getConfig: () => ({ trustedProxies: [], publicUrlSeed: 'http://localhost:3000' }),
}))

vi.mock('@/lib/jobs/boss', () => ({
  sendJob: async () => 'job-1',
  rescheduleBackups: async () => {},
}))

import AdminLayout from './layout'
import AdminOverviewPage from './page'
import UsagePage from './usage/page'
import AuditPage from './audit/page'
import BackupsPage from './backups/page'
import SiteSettingsPage from './settings/site/page'

const nothing = Promise.resolve({})

describe('the admin nav', () => {
  it('offers every destination as a button', async () => {
    const html = renderToStaticMarkup(await AdminLayout({ children: <p>body</p> }))

    expect(html).toContain('href="/app/admin/users"')
    expect(html).toContain('href="/app/admin/audit"')
    expect(html).toContain('rounded-md border border-[var(--border)]')
  })
})

describe('the usage page', () => {
  it('shows what the month cost, by model and by person', async () => {
    const html = renderToStaticMarkup(await UsagePage())

    expect(html).toContain('$0.0003')
    expect(html).toContain('deepseek-flash')
    expect(html).toContain('alice@example.test')
    expect(html).toContain('500')
  })
})

describe('the admin screens', () => {
  it('shows the overview in English', async () => {
    const html = renderToStaticMarkup(await AdminOverviewPage())

    expect(html).toContain('Overview')
    expect(html).toContain('Memories')
    expect(html).toContain('Backups')
  })

  it('shows the audit log with its column labels', async () => {
    const html = renderToStaticMarkup(await AuditPage({ searchParams: nothing }))

    expect(html).toContain('Audit log')
    expect(html).toContain('Export CSV')
    expect(html).toContain('Nothing matches.')
  })

  it('shows backups with the retention sentence', async () => {
    const html = renderToStaticMarkup(await BackupsPage({ searchParams: nothing }))

    expect(html).toContain('Backups')
    expect(html).toContain('Scheduled backups are off.')
    expect(html).toContain('No runs yet.')
  })

  it('shows the site settings form', async () => {
    const html = renderToStaticMarkup(await SiteSettingsPage({ searchParams: nothing }))

    expect(html).toContain('Site settings')
    expect(html).toContain('Public URL')
    expect(html).toContain('Require two-factor for every user')
  })

  it('speaks Danish when the account does', async () => {
    mocks.locale = 'da'

    try {
      const overview = renderToStaticMarkup(await AdminOverviewPage())
      const site = renderToStaticMarkup(await SiteSettingsPage({ searchParams: nothing }))

      expect(overview).toContain('Overblik')
      expect(overview).toContain('Erindringer')
      expect(site).toContain('Webstedsindstillinger')
    } finally {
      mocks.locale = 'en'
    }
  })
})
