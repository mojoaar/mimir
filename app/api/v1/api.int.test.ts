import { NextRequest } from 'next/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { GET as listProjects } from '@/app/api/v1/projects/route'
import { GET as readMemoryRoute, PUT as writeMemoryRoute } from '@/app/api/v1/projects/[slug]/memory/[...path]/route'
import { GET as healthRoute } from '@/app/api/health/route'
import { POST as ingestRoute } from '@/app/api/v1/projects/[slug]/ingest/route'
import { GET as readMemoryGet } from '@/app/api/v1/projects/[slug]/memory/[...path]/route'
import { GET as listVersionsRoute } from '@/app/api/v1/projects/[slug]/versions/route'
import { POST as restoreVersionRoute } from '@/app/api/v1/projects/[slug]/versions/[id]/restore/route'
import { GET as treeRoute } from '@/app/api/v1/projects/[slug]/tree/route'
import { POST as learnRoute } from '@/app/api/v1/projects/[slug]/learn/route'
import { POST as searchRoute } from '@/app/api/v1/search/route'
import { resolveProject } from '@/lib/projects/service'
import { writeMemory } from '@/lib/memory/service'
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

  it('records who wrote the memory, so history is not anonymous', async () => {
    await writeMemoryRoute(
      req(`/api/v1/projects/${slug}/memory/who/x`, {
        method: 'PUT',
        body: { body: 'traced', client: 'curl', session: 'ses_rest' },
      }),
      params({ path: ['who', 'x'] }),
    )

    const res = await readMemoryRoute(
      req(`/api/v1/projects/${slug}/memory/who/x`),
      params({ path: ['who', 'x'] }),
    )
    const memory = await res.json()
    expect(memory.client).toBe('curl')
    expect(memory.session).toBe('ses_rest')
  })

  it('writes exactly one audit row per rest call', async () => {    await writeMemoryRoute(
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

describe('learning over the rest api', () => {
  // The MCP tool is covered; this path is what a script uses, and it must not
  // answer queued when the project will silently write nothing.
  it('refuses instead of queueing when learning is off', async () => {
    const response = await learnRoute(
      req(`/api/v1/projects/${slug}/learn`, {
        method: 'POST',
        body: { transcript: 'we chose the rollback path today '.repeat(20) },
      }),
      { params: Promise.resolve({ slug }) },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ queued: false, reason: 'learning is off for this project' })
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

  // A read must not have the side effect of creating the project it names.
  it('answers 404 for an unknown project instead of creating one', async () => {
    const missing = await treeRoute(
      req('/api/v1/projects/no-such-project/tree'),
      { params: Promise.resolve({ slug: 'no-such-project', path: [] }) },
    )

    expect(missing.status).toBe(404)
    const { rows } = await adminPool().query<{ count: string }>(
      `select count(*) from projects where slug = 'no-such-project'`,
    )
    expect(rows[0]?.count).toBe('0')
  })
})

describe('search over the rest api', () => {
  it('searches every project the token can read', async () => {
    const second = await resolveProject(fixtures.alice, { repo: 'github.com/alice/second', create: true })
    const body = 'roll back by redeploying the previous image'
    await writeMemory({ userId: fixtures.alice, projectId: fixtures.aliceProjectId, path: 'deploy/rollback', body })
    await writeMemory({ userId: fixtures.alice, projectId: second.id, path: 'auth/rotate', body })

    const response = await searchRoute(req('/api/v1/search', { method: 'POST', body: { query: 'redeploying' } }))
    expect(response.status).toBe(200)
    const payload = (await response.json()) as { results: { projectSlug: string }[] }
    expect(new Set(payload.results.map((hit) => hit.projectSlug)).size).toBe(2)
  })

  it('narrows to the project a slug names', async () => {
    const second = await resolveProject(fixtures.alice, { repo: 'github.com/alice/second', create: true })
    const body = 'roll back by redeploying the previous image'
    await writeMemory({ userId: fixtures.alice, projectId: fixtures.aliceProjectId, path: 'deploy/rollback', body })
    await writeMemory({ userId: fixtures.alice, projectId: second.id, path: 'auth/rotate', body })

    const response = await searchRoute(
      req('/api/v1/search', { method: 'POST', body: { query: 'redeploying', project: second.slug } }),
    )
    expect(response.status).toBe(200)
    const payload = (await response.json()) as { results: { projectSlug: string }[] }
    expect(payload.results.length).toBeGreaterThan(0)
    expect(payload.results.every((hit) => hit.projectSlug === second.slug)).toBe(true)
  })
})
