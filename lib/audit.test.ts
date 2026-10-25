import { describe, expect, it } from 'vitest'
import { describeAuditFailure } from './audit'

describe('describeAuditFailure', () => {
  it('keeps the message so an operator can act on it', () => {
    const text = describeAuditFailure(new Error('relation "audit_log" does not exist'))
    expect(text).toBe('relation "audit_log" does not exist')
  })

  it('keeps a long table name', () => {
    expect(describeAuditFailure(new Error('relation "memory_versions" does not exist'))).toBe(
      'relation "memory_versions" does not exist',
    )
  })

  it('keeps a long constraint name', () => {
    const message = 'duplicate key value violates unique constraint "memories_project_id_path_key"'
    expect(describeAuditFailure(new Error(message))).toBe(message)
  })

  it('masks a password that ended up in the message', () => {
    const text = describeAuditFailure(new Error('login failed password=hunter2hunter2 for alice'))
    expect(text).not.toContain('hunter2hunter2')
    expect(text).toContain('login failed')
    expect(text).toContain('for alice')
  })

  it('masks a token that ended up in the message', () => {
    const text = describeAuditFailure(new Error('auth token=Yk3n8Qr2Lm9pXz4Tv7Wc1Hs6 rejected'))
    expect(text).not.toContain('Yk3n8Qr2Lm9pXz4Tv7Wc1Hs6')
    expect(text).toContain('rejected')
  })

  it('masks a bare credential but keeps its last four characters', () => {
    const text = describeAuditFailure(new Error('connect failed for Yk3n8Qr2Lm9pXz4Tv7Wc1Hs6'))
    expect(text).not.toContain('Yk3n8Qr2Lm9pXz4')
    expect(text).toContain('1Hs6')
  })

  it('masks a 64 character hex secret', () => {
    const text = describeAuditFailure(new Error('bad key 4f8a9c1e7b2d6a3f4f8a9c1e7b2d6a3f4f8a9c1e7b2d6a3f4f8a9c1e7b2d6a3f'))
    expect(text).not.toContain('4f8a9c1e7b2d6a3f4f8a96')
    expect(text).toContain('6a3f')
  })

  it('survives a thrown non-Error', () => {
    expect(describeAuditFailure('boom')).toBe('boom')
  })

  it('survives nothing at all', () => {
    expect(describeAuditFailure(null)).toBe('unknown error')
    expect(describeAuditFailure(undefined)).toBe('unknown error')
  })
})

describe('a connection string in a failure', () => {
  it('masks the password but keeps the host and message', () => {
    const text = describeAuditFailure(new Error('connect ECONNREFUSED postgres://mimir_app:hunter2@db:5432'))

    expect(text).toContain('ECONNREFUSED')
    expect(text).toContain('db:5432')
    expect(text).not.toContain('hunter2')
  })
})
