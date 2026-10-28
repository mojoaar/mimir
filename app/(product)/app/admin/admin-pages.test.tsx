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

vi.mock('@/lib/jobs/service', () => ({
  queueHealth: async () => ({ started: true }),
  jobCounts: async () => [
    { name: 'extract', state: 'completed', count: 8 },
    { name: 'extract', state: 'failed', count: 3 },
  ],
  recentJobs: async () => [
    {
      id: 'job-1',
      name: 'backfill',
      state: 'completed',
      createdAt: new Date('2026-10-25T10:00:00Z'),
      startedAt: new Date('2026-10-25T10:00:00Z'),
      completedAt: new Date('2026-10-25T10:00:02Z'),
      retryCount: 0,
      retryLimit: 2,
      detail: '12 embedded',
    },
    {
      id: 'job-2',
      name: 'extract',
      state: 'failed',
      createdAt: new Date('2026-10-25T09:00:00Z'),
      startedAt: new Date('2026-10-25T09:00:00Z'),
      completedAt: new Date('2026-10-25T09:00:01Z'),
      retryCount: 2,
      retryLimit: 2,
      detail: 'bad port',
    },
  ],
  embeddingCoverage: async () => ({
    total: 7,
    embedded: 7,
    missing: 0,
    lastEmbeddedAt: new Date('2026-10-25T10:00:00Z'),
    models: [{ model: 'nomic-embed-text', count: 7 }],
    projects: [],
  }),
  embeddingCalls: async () => [{ purpose: 'embed.ingest', count: 3, failures: 0 }],
}))

vi.mock('@/lib/settings/embedding', () => ({
  getEmbeddingConfig: async () => ({ providerId: 'p1', model: 'nomic-embed-text', dim: 768 }),
}))

vi.mock('@/lib/usage/service', () => ({
  spike: async () => ({ calls: 40, median: 2, hourStart: '2026-10-26T09:00:00Z' }),
  dismissed: async () => false,
  spend: async () => ({ llmMicros: 300, embeddingMicros: 40, calls: 4, unpriced: 1 }),
  daily: async () => [{ day: '2026-10-25', micros: 340 }],
  hourly: async () => [{ hour: '2026-10-25T10:00', calls: 2 }],
  breakdown: async () => [
    { preset: 'deepseek', model: 'deepseek-flash', kind: 'llm', calls: 3, micros: 300 },
  ],
  people: async () => [{ email: 'alice@example.test', calls: 4, micros: 340 }],
  pruneUsage: async () => 0,
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
  listAuditActions: async () => [{ action: 'memory.read', count: 2 }],
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
import JobsPage from './jobs/page'
import AdminOverviewPage from './page'
import UsagePage from './usage/page'
import AuditPage from './audit/page'
import BackupsPage from './backups/page'
import SiteSettingsPage from './settings/site/page'

const nothing = Promise.resolve({})

vi.mock('@/lib/settings/analytics', () => ({
  getAnalytics: async () => ({ enabled: false, scriptUrl: '', websiteId: '' }),
  setAnalytics: async () => {},
}))

vi.mock('@/lib/settings/learning', () => ({
  getLearningDefault: async () => false,
  setLearningDefault: async () => {},
}))

vi.mock('@/lib/settings/time', () => ({
  getTimezone: async () => 'UTC',
  getClock: async () => '24h',
  getTimeFormat: async () => ({ timeZone: 'UTC', clock: '24h' }),
  timezoneOptions: () => ['UTC', 'Europe/Copenhagen'],
  defaultTimezone: () => 'UTC',
  setTimezone: async () => {},
  setClock: async () => {},
}))

describe('the admin nav', () => {
  it('offers every destination as a button', async () => {
    const html = renderToStaticMarkup(await AdminLayout({ children: <p>body</p> }))

    expect(html).toContain('href="/app/admin/users"')
    expect(html).toContain('href="/app/admin/audit"')
    expect(html).toContain('href="/app/admin/jobs"')
    expect(html).toContain('href="/app/admin/usage"')
    expect(html).toContain('rounded-md border border-[var(--border)]')
    expect(html).toContain('Usage spike · 40 calls this hour')
  })
})

describe('the usage page', () => {
  it('shows what the month cost, by model and by person', async () => {
    const html = renderToStaticMarkup(await UsagePage({ searchParams: Promise.resolve({}) }))

    expect(html).toContain('$0.0003')
    expect(html).toContain('deepseek-flash')
    expect(html).toContain('alice@example.test')
    expect(html).toContain('500')
  })

  it('offers a manual prune and reports what it removed', async () => {
    const html = renderToStaticMarkup(
      await UsagePage({ searchParams: Promise.resolve({ pruned: '12', days: '90' }) }),
    )

    expect(html).toContain('name="days"')
    expect(html).toContain('Delete older calls')
    expect(html).toContain('Pruned calls older than 90 days: 12.')
  })
})

describe('the jobs page', () => {
  it('shows the queue, the coverage and what each job did', async () => {
    const html = renderToStaticMarkup(await JobsPage())

    expect(html).toContain('The queue is running.')
    expect(html).toContain('7 / 7 memories carry a vector')
    expect(html).toContain('nomic-embed-text')
    expect(html).toContain('12 embedded')
    expect(html).toContain('bad port')
    expect(html).toContain('2/2')
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
    expect(html).toContain('name="learningDefault"')
    expect(html).toContain('Learn from new projects')
    expect(html).toContain('name="analyticsEnabled"')
    expect(html).toContain('name="analyticsScriptUrl"')
    expect(html).toContain('name="analyticsWebsiteId"')
    expect(html).toContain('Send pageviews to Umami')
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
