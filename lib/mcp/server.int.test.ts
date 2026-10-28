import { beforeEach, describe, expect, it } from 'vitest'
import { adminPool } from '@/lib/db/pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'
import type { AuthUser } from '@/lib/auth/types'
import { handleRpc } from './server'

let f: Fixtures
let alice: AuthUser
let bob: AuthUser

const meta = { ip: '10.0.0.1', userAgent: 'vitest' }

const asUser = (id: string, email: string): AuthUser => ({
  id,
  email,
  name: '',
  role: 'user',
  status: 'active',
  mfaEnabled: false,
  locale: 'en',
})

const call = (name: string, args: Record<string, unknown> = {}) => ({
  jsonrpc: '2.0' as const,
  id: 9,
  method: 'tools/call',
  params: { name, arguments: args },
})

beforeEach(async () => {
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
  alice = asUser(f.alice, f.email)
  bob = asUser(f.bob, 'bob@example.test')
})

describe('mcp server', () => {
  it('answers with the version it speaks, not the one the client claimed', async () => {
    const reply = (await handleRpc(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } },
      alice,
      meta,
    )) as { result: { protocolVersion: string } }

    expect(reply.result.protocolVersion).toBe('2025-06-18')
  })

  it('rejects an unknown kind with the documented code', async () => {
    const reply = (await handleRpc(
      call('memory_write', { path: 'x', body: 'text', kind: 'nonsense' }),
      alice,
      meta,
    )) as any
    expect(reply.error.data.code).toBe('invalid_params')
  })

  it('answers initialize and lists eight tools', async () => {
    const init = (await handleRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, alice, meta)) as any
    expect(init.result.serverInfo.name).toBe('mimir')
    expect(init.result.instructions).toContain('memory_digest')
    expect(init.result.instructions).toContain('one outcome')

    const list = (await handleRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, alice, meta)) as any
    expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual([
      'memory_tree',
      'memory_read',
      'memory_search',
      'memory_digest',
      'memory_write',
      'memory_ingest',
      'memory_delete',
      'project_list',
    ])
  })

  it('round-trips a write and a read through tools/call', async () => {
    const write = (await handleRpc(
      call('memory_write', { repo: 'github.com/a/b', path: 'conventions/x', body: 'use tabs' }),
      alice,
      meta,
    )) as any
    expect(write.error).toBeUndefined()
    expect(write.result.content[0].type).toBe('text')

    const read = (await handleRpc(call('memory_read', { repo: 'github.com/a/b', path: 'conventions/x' }), alice, meta)) as any
    expect(read.result.body).toBe('use tabs')
  })

  it('audits one row per call', async () => {
    await handleRpc(call('memory_tree', { repo: 'github.com/a/b' }), alice, meta)
    const { rows } = await adminPool().query("SELECT action FROM audit_log WHERE action LIKE 'memory.%'")
    expect(rows).toHaveLength(1)
    expect(rows[0].action).toBe('memory.read')
  })

  it("does not reveal whether a path exists in someone else's project", async () => {
    const { rows } = await adminPool().query<{ slug: string }>(
      'SELECT slug FROM projects WHERE owner_user_id = $1',
      [f.bob],
    )
    const bobSlug = rows[0]!.slug
    await handleRpc(call('memory_write', { project: bobSlug, path: 'exists', body: 'secret' }), bob, meta)

    const res = (await handleRpc(call('memory_read', { project: bobSlug, path: 'exists' }), alice, meta)) as any
    expect(res.result).toBeUndefined()
    expect(res.error.data.code).toBe('forbidden')
  })

  it('responds to a notification with silence', async () => {
    const res = await handleRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, alice, meta)
    expect(res).toBeNull()
  })

  it('rejects an unknown method with -32601', async () => {
    const res = (await handleRpc({ jsonrpc: '2.0', id: 3, method: 'tools/nope' }, alice, meta)) as any
    expect(res.error.code).toBe(-32601)
  })

  it('imports a batch through memory_ingest', async () => {
    const res = (await handleRpc(
      call('memory_ingest', { repo: 'github.com/alice/ingest-repo', files: [{ path: 'a.md', body: 'via mcp' }] }),
      alice,
      meta,
    )) as { result: { written: number } }
    expect(res.result.written).toBe(1)
  })
})
