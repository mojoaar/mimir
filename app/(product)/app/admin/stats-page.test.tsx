import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getStats: vi.fn(),
}))

vi.mock('@/lib/auth/admin', () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock('@/lib/db/tx', () => ({
  withAdmin: async (run: (client: unknown) => unknown) =>
    run({
      query: async (sql: string) => {
        if (sql.includes('from users')) {
          return { rows: [{ status: 'active', count: '3' }, { status: 'pending', count: '1' }] }
        }
        if (sql.includes('from projects')) {
          return { rows: [{ projects: '2', memories: '10', embedded: '7' }] }
        }
        if (sql.includes('from backup_runs')) return { rows: [] }
        return { rows: [{ active: '0', failed: '2' }] }
      },
    }),
}))

describe('admin overview', () => {
  it('shows the counts and Never for a backup that has not run', async () => {
    mocks.requireAdmin.mockResolvedValue({ id: 'a', email: 'admin@example.test', role: 'admin' })
    const { default: Page } = await import('./page')

    const html = renderToStaticMarkup(await Page())

    expect(html).toContain('3')
    expect(html).toContain('10')
    expect(html).toContain('70% embedded')
    expect(html).toContain('Never')
    expect(html).toContain('2 failed')
  })
})
