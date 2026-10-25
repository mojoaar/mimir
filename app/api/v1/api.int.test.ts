import { NextRequest } from 'next/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { GET as listProjects } from '@/app/api/v1/projects/route'
import { GET as readMemoryRoute, PUT as writeMemoryRoute } from '@/app/api/v1/projects/[slug]/memory/[...path]/route'
import { GET as healthRoute } from '@/app/api/health/route'
import { POST as ingestRoute } from '@/app/api/v1/projects/[slug]/ingest/route'
import { GET as readMemoryGet } from '@/app/api/v1/projects/[slug]/memory/[...path]/route'
import { GET as listVersionsRoute } from '@/app/api/v1/projects/[slug]/versions/route'
import { POST as restoreVersionRoute } from '@/app/api/v1/projects/[slug]/versions/[id]/restore/route'
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

  it('rejects an empty body and an unknown kind like mcp does', async () => {
    const empty = await writeMemoryRoute(
      req(`/api/v1/projects/${slug}/memory/x/empty`, { method: 'PUT', body: { body: '' } }),
      params({ path: ['x', 'empty'] }),
    )
    expect(empty.status).toBe(400)
    expect((await empty.json()).code).toBe('invalid_params')

    const kind = await writeMemoryRoute(
      req(`/api/v1/projects/${slug}/memory/x/kind`, {
        method: 'PUT',
        body: { body: 'text', kind: 'nonsense' },
      }),
      params({ path: ['x', 'kind'] }),
    )
    expect(kind.status).toBe(400)
    expect((await kind.json()).code).toBe('invalid_params')
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

  it('ingests a batch and makes it readable', async () => {
    const res = await ingestRoute(
      req(`/api/v1/projects/${slug}/ingest`, { method: 'POST', body: { files: [{ path: 'docs/a.md', body: 'imported' }] } }),
      params(),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ written: 1, skipped: [] })

    const read = await readMemoryGet(
      req(`/api/v1/projects/${slug}/memory/import/docs/a.md`),
      params({ path: ['import', 'docs', 'a.md'] }),
    )
    expect((await read.json()).body).toBe('imported')
  })
})

describe('memory history over the rest api', () => {
  it('lists versions without their bodies and restores one as a new version', async () => {
    await writeMemoryRoute(
      req(`/api/v1/projects/${slug}/memory/hist/x`, { method: 'PUT', body: { body: 'first' } }),
      params({ path: ['hist', 'x'] }),
    )
    await writeMemoryRoute(
      req(`/api/v1/projects/${slug}/memory/hist/x`, { method: 'PUT', body: { body: 'second' } }),
      params({ path: ['hist', 'x'] }),
    )

    const listed = await listVersionsRoute(
      req(`/api/v1/projects/${slug}/versions?path=hist%2Fx`),
      { params: Promise.resolve({ slug }) },
    )
    const body = (await listed.json()) as { versions: { id: string; bytes: number; body?: string }[] }
    expect(listed.status).toBe(200)
    expect(body.versions).toHaveLength(1)
    expect(body.versions[0]?.body).toBeUndefined()
    expect(body.versions[0]?.bytes).toBe('first'.length)
    expect(body.versions[0]?.id).toMatch(/^\d+$/)

    const restored = await restoreVersionRoute(
      req(`/api/v1/projects/${slug}/versions/${body.versions[0]!.id}/restore`, { method: 'POST' }),
      { params: Promise.resolve({ slug, id: body.versions[0]!.id }) },
    )
    expect(await restored.json()).toEqual({ restored: true, path: 'hist/x' })

    const read = await readMemoryRoute(
      req(`/api/v1/projects/${slug}/memory/hist/x`),
      params({ path: ['hist', 'x'] }),
    )
    expect((await read.json()).body).toBe('first')

    const after = await listVersionsRoute(
      req(`/api/v1/projects/${slug}/versions?path=hist%2Fx`),
      { params: Promise.resolve({ slug }) },
    )
    // The body the restore replaced is history now, so a restore can be undone.
    expect(((await after.json()) as { versions: unknown[] }).versions).toHaveLength(2)

    const { rows } = await adminPool().query<{ detail: { via?: string } }>(
      `select detail from audit_log where action = 'memory.restore_version' order by id desc limit 1`,
    )
    expect(rows[0]?.detail).toMatchObject({ via: 'api' })
  })

  it('refuses a version from another project', async () => {
    const other = await restoreVersionRoute(
      req(`/api/v1/projects/${slug}/versions/999999/restore`, { method: 'POST' }),
      { params: Promise.resolve({ slug, id: '999999' }) },
    )
    expect(other.status).toBe(404)
    expect((await other.json()).code).toBe('not_found')
  })
})
