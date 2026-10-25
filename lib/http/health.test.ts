import { describe, expect, it } from 'vitest'
import { healthPayload } from './health'

const meta = { version: '0.1.1', uptimeSeconds: 12 }
const up = { ok: true, latencyMs: 3 }
const down = { ok: false, latencyMs: 0 }

describe('healthPayload', () => {
  it('tells an anonymous caller only that the install is up', () => {
    expect(healthPayload(up, meta, null)).toEqual({ body: { status: 'ok' }, status: 200 })
  })

  it('reports a dead database with 503, still without detail', () => {
    expect(healthPayload(down, meta, null)).toEqual({
      body: { status: 'unavailable' },
      status: 503,
    })
  })

  it('gives an authenticated caller the version, uptime, database and user', () => {
    const { body, status } = healthPayload(up, meta, { email: 'a@example.test' })
    expect(status).toBe(200)
    expect(body).toMatchObject({ status: 'ok', version: '0.1.1', uptimeSeconds: 12, database: up })
    expect(body.user).toBe('a@example.test')
  })

  it('calls a degraded database degraded for an authenticated caller', () => {
    expect(healthPayload(down, meta, { email: 'a@example.test' }).body.status).toBe('degraded')
  })
})
