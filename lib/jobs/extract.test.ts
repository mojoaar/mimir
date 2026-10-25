import { describe, expect, it } from 'vitest'
import { parseExtraction } from './extract'

describe('parseExtraction', () => {
  it('parses a fenced json reply', () => {
    expect(
      parseExtraction('```json\n{"title":"Use compose down","summary":"Roll back by stopping the stack."}\n```'),
    ).toEqual({ title: 'Use compose down', summary: 'Roll back by stopping the stack.' })
  })

  it('rejects a reply with no summary', () => {
    expect(parseExtraction('{"title":"x"}')).toBeNull()
  })

  it('rejects prose', () => {
    expect(parseExtraction('Sure! Here is the metadata you asked for.')).toBeNull()
  })

  it('truncates an oversized title and summary', () => {
    const parsed = parseExtraction(
      JSON.stringify({ title: 't'.repeat(200), summary: 's'.repeat(600) }),
    )
    expect(parsed?.title).toHaveLength(120)
    expect(parsed?.summary).toHaveLength(400)
  })

  it('accepts capitalised keys', () => {
    const parsed = parseExtraction(JSON.stringify({ Title: 'Compose binds to loopback', Summary: 'Only the proxy reaches it.' }))
    expect(parsed).toEqual({ title: 'Compose binds to loopback', summary: 'Only the proxy reaches it.' })
  })
})
