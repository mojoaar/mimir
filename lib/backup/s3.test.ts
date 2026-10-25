import { describe, expect, it, vi } from 'vitest'
import { s3Storage } from './s3'
import type { S3Credentials } from '@/lib/settings/backup-settings'

const config: S3Credentials = {
  bucket: 'mimir',
  endpoint: 'https://s3.example.test',
  region: 'eu-west-1',
  prefix: 'backups',
  pathStyle: true,
  accessKeyId: 'AKIAEXAMPLE',
  secretAccessKey: 'secret-value',
}

function fakeFetch(responses: { status?: number; body?: string; headers?: Record<string, string> }[] = []) {
  const queue = [...responses]
  return vi.fn(async () => {
    const next = queue.shift() ?? { status: 200 }
    return new Response(next.body ?? '', {
      status: next.status ?? 200,
      headers: next.headers ?? {},
    })
  })
}

describe('s3 storage', () => {
  it('puts an object with a signed request at a path-style url', async () => {
    const fetch = fakeFetch([{ status: 200 }])
    const storage = s3Storage(config, { fetch })
    await storage.put('mimir-1.dump.enc', Buffer.from('body'))
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://s3.example.test/mimir/backups/mimir-1.dump.enc')
    expect(init.method).toBe('PUT')
    expect(String(new Headers(init.headers).get('authorization'))).toMatch(/^AWS4-HMAC-SHA256/)
  })

  it('puts at a virtual-host url when path style is off', async () => {
    const fetch = fakeFetch()
    await s3Storage({ ...config, pathStyle: false }, { fetch }).put('mimir-1.dump.enc', Buffer.from('body'))
    const calls = fetch.mock.calls as unknown as [string, RequestInit][]
    expect(calls[0]?.[0]).toBe('https://mimir.s3.example.test/backups/mimir-1.dump.enc')
  })

  it('reads the size from head and reports a missing object as null', async () => {
    const fetch = fakeFetch([{ headers: { 'content-length': '12' } }, { status: 404 }])
    const storage = s3Storage(config, { fetch })
    await expect(storage.head('backups/a.enc')).resolves.toEqual({ size: 12 })
    await expect(storage.head('backups/b.enc')).resolves.toBeNull()
  })

  it('lists keys and sizes from a prefix listing', async () => {
    const body = `<?xml version="1.0"?><ListBucketResult>
      <Contents><Key>backups/mimir-1.dump.enc</Key><Size>10</Size></Contents>
      <Contents><Key>backups/settings-1.json.enc</Key><Size>20</Size></Contents>
    </ListBucketResult>`
    const fetch = fakeFetch([{ body }])
    await expect(s3Storage(config, { fetch }).list('backups')).resolves.toEqual([
      { key: 'mimir-1.dump.enc', size: 10 },
      { key: 'settings-1.json.enc', size: 20 },
    ])
  })

  it('removes an object', async () => {
    const fetch = fakeFetch()
    await s3Storage(config, { fetch }).remove('mimir-1.dump.enc')
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://s3.example.test/mimir/backups/mimir-1.dump.enc')
    expect(init.method).toBe('DELETE')
  })
})
