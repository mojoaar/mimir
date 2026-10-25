import { describe, expect, it } from 'vitest'
import { MAX_REQUEST_BYTES, rejectOversized } from './limit'

const withLength = (value?: string) =>
  ({ headers: new Headers(value === undefined ? {} : { 'content-length': value }) })

describe('rejectOversized', () => {
  it('refuses a declared body above the ceiling before it is parsed', () => {
    const response = rejectOversized(withLength(String(MAX_REQUEST_BYTES + 1)))
    expect(response?.status).toBe(413)
  })

  it('allows a body at the ceiling', () => {
    expect(rejectOversized(withLength(String(MAX_REQUEST_BYTES)))).toBeNull()
  })

  it('allows a request with no declared length', () => {
    expect(rejectOversized(withLength())).toBeNull()
  })
})
