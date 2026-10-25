import { NextRequest } from 'next/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { GET as listProjects } from '@/app/api/v1/projects/route'
import { GET as readMemoryRoute, PUT as writeMemoryRoute } from '@/app/api/v1/projects/[slug]/memory/[...path]/route'
import { GET as healthRoute } from '@/app/api/health/route'
import { sha256 } from '@/lib/crypto'
import { adminPool } from '@/lib/db/pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'

const TOKEN = 'mimir_test-token-for-fixtures'
let fixtures: Fixtures
let slug: string

function req(path: string, init: { method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` }
  if (init.body !== undefined) headers['content-type'] = 'application/json'
  return new NextRequest(`http://mimir.test${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

function params(extra: { path?: string[] } = {}) {
  return { params: Promise.resolve({ slug, path: extra.path ?? [] }) }
}

beforeAll(async () => {
  await resetFixtures()
  fixtures = await seedTwoUsersWithProjects()
  const { rows } = await adminPool().query<{ slug: string }>('select slug from projects where id = $1', [
    fixtures.aliceProjectId,
  ])
  slug = rows[0]!.slug

  await adminPool().query(
    `insert into api_keys (user_id, name, prefix, key_hash) values ($1, 'int-test', $2, $3)`,
    [fixtures.alice, 'mimir_test-toke', sha256(TOKEN)],
  )
})

describe('rest api', () => {
  it('stores and returns a memory', async () => {
    const written = await writeMemoryRoute(
      req(`/api/v1/projects/${slug}/memory/notes/x`, { method: 'PUT', body: { body: 'hello' } }),
      params({ path: ['notes', 'x'] }),
    )
    expect(written.status).toBe(200)

    const read = await readMemoryRoute(
      req(`/api/v1/projects/${slug}/memory/notes/x`),
      params({ path: ['notes', 'x'] }),
    )
    expect((await read.json()).body).toBe('hello')
  })

  it('writes exactly one audit row per rest call', async () => {
    await writeMemoryRoute(
      req(`/api/v1/projects/${slug}/memory/notes/audited`, { method: 'PUT', body: { body: 'traced' } }),
      params({ path: ['notes', 'audited'] }),
    )

    const { rows } = await adminPool().query<{ action: string; target_id: string }>(
      `select action, target_id from audit_log where actor_id = $1 order by id desc limit 2`,
      [fixtures.alice],
    )
    expect(rows[0]).toMatchObject({ action: 'memory.write' })
    expect(rows[0]!.target_id).toContain('/memory/notes/audited')
  })

  it('lists projects for the key owner', async () => {
    const res = await listProjects(req('/api/v1/projects'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.projects.map((p: { slug: string }) => p.slug)).toContain(slug)
  })

  it('rejects an unauthenticated request', async () => {
    const res = await listProjects(new NextRequest('http://x/api/v1/projects'))
    expect(res.status).toBe(401)
  })

  it('reports health anonymously and in detail when authenticated', async () => {
    const anonymous = await (await healthRoute(new NextRequest('http://x/api/health'))).json()
    expect(Object.keys(anonymous)).toEqual(['status'])

    const authenticated = await (await healthRoute(req('/api/health'))).json()
    expect(authenticated).toMatchObject({ status: 'ok', version: expect.any(String) })
  })

  it('rejects a body one byte over the limit with a message naming it', async () => {
    const res = await writeMemoryRoute(
      req(`/api/v1/projects/${slug}/memory/x/y`, { method: 'PUT', body: { body: 'x'.repeat(262145) } }),
      params({ path: ['x', 'y'] }),
    )
    expect(res.status).toBe(413)
    expect((await res.json()).error).toMatch(/262144/)
  })
})
