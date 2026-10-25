import { describe, expect, it, vi } from 'vitest'
import { webDavStorage } from './webdav'
import type { WebDavCredentials } from '@/lib/settings/backup-settings'

const config: WebDavCredentials = {
  baseUrl: 'https://webdav.pcloud.com',
  username: 'mojoaar',
  password: 'app-password',
  prefix: 'mimir',
}

function fakeFetch(responses: { status?: number; body?: string; headers?: Record<string, string> }[] = []) {
  const queue = [...responses]
  return vi.fn(async () => {
    const next = queue.shift() ?? { status: 200 }
    return new Response(next.body ?? '', { status: next.status ?? 200, headers: next.headers ?? {} })
  })
}

describe('webdav storage', () => {
  it('puts with basic auth under the prefix', async () => {
    const fetch = fakeFetch()
    await webDavStorage(config, { fetch }).put('mimir-1.dump.enc', Buffer.from('body'))
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://webdav.pcloud.com/mimir/mimir-1.dump.enc')
    expect(init.method).toBe('PUT')
    expect(String(new Headers(init.headers).get('authorization'))).toMatch(/^Basic /)
  })

  it('reads the size from head and reports 404 as null', async () => {
    const fetch = fakeFetch([{ headers: { 'content-length': '9' } }, { status: 404 }])
    const storage = webDavStorage(config, { fetch })
    await expect(storage.head('a.enc')).resolves.toEqual({ size: 9 })
    await expect(storage.head('b.enc')).resolves.toBeNull()
  })

  it('lists a directory with propfind', async () => {
    const body = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">
      <d:response><d:href>/mimir/mimir-1.dump.enc</d:href>
        <d:propstat><d:prop><d:getcontentlength>10</d:getcontentlength></d:prop></d:propstat></d:response>
      <d:response><d:href>/mimir/settings-1.json.enc</d:href>
        <d:propstat><d:prop><d:getcontentlength>20</d:getcontentlength></d:prop></d:propstat></d:response>
    </d:multistatus>`
    const fetch = fakeFetch([{ body }])
    await expect(webDavStorage(config, { fetch }).list('mimir')).resolves.toEqual([
      { key: 'mimir-1.dump.enc', size: 10 },
      { key: 'settings-1.json.enc', size: 20 },
    ])
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.method).toBe('PROPFIND')
  })

  it('removes an object', async () => {
    const fetch = fakeFetch()
    await webDavStorage(config, { fetch }).remove('mimir-1.dump.enc')
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.method).toBe('DELETE')
  })
})
