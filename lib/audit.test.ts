import { describe, expect, it } from 'vitest'
import { describeAuditFailure } from './audit'

describe('describeAuditFailure', () => {
  it('keeps the message so an operator can act on it', () => {
    const text = describeAuditFailure(new Error('relation "audit_log" does not exist'))
    expect(text).toBe('relation "audit_log" does not exist')
  })

  it('redacts a credential that ended up in the message', () => {
    const text = describeAuditFailure(new Error('connect failed for mimir_supersecretkey1234'))
    expect(text).not.toContain('supersecret')
    expect(text).toContain('1234')
  })

  it('survives a thrown non-Error', () => {
    expect(describeAuditFailure('boom')).toBe('boom')
  })
})
