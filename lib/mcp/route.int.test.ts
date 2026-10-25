import { NextRequest } from 'next/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { GET, POST } from '@/app/mcp/route'
import { sha256 } from '@/lib/crypto'
import { adminPool } from '@/lib/db/pool'
import { resetFixtures, seedTwoUsersWithProjects, type Fixtures } from '@/lib/db/seed'

const TOKEN = 'mimir_mcp-route-test-token'
let f: Fixtures

function rpc(body: unknown, headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` }) {
  return new NextRequest('http://mimir.test/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

beforeAll(async () => {
  await resetFixtures()
  f = await seedTwoUsersWithProjects()
  await adminPool().query(
    `insert into api_keys (user_id, name, prefix, key_hash) values ($1, 'mcp-route-test', $2, $3)`,
    [f.alice, 'mimir_mcp-route', sha256(TOKEN)],
  )
})

describe('POST /mcp', () => {
  it('answers GET with 405 and an Allow header', async () => {
    const res = await GET()
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('POST')
  })

  it('rejects a call with no bearer token', async () => {
    const res = await POST(rpc({ jsonrpc: '2.0', id: 1, method: 'initialize' }, {}))
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toBe('Bearer')
  })

  it('answers a NUL byte in a body with the documented code, never the driver message', async () => {
    const res = await POST(
      rpc({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'memory_write',
          arguments: { repo: 'github.com/test/nul', path: 'a/b', body: 'a\u0000b' },
        },
      }),
    )
    const body = await res.json()
    expect(body.error.data.code).toBe('invalid_params')
    expect(JSON.stringify(body)).not.toContain('UTF8')
  })
})
