import type { WebDavCredentials } from '@/lib/settings/backup-settings'
import type { Storage } from './storage'

type Fetch = typeof fetch

/** BodyInit in this project does not accept Node's Buffer or a shared-array view. */
function toBody(body: Buffer): ArrayBuffer {
  const copy = new ArrayBuffer(body.byteLength)
  new Uint8Array(copy).set(body)
  return copy
}

function trimPrefix(prefix: string): string {
  return prefix.replace(/^\/+|\/+$/g, '')
}

function directoryUrl(config: WebDavCredentials, prefix: string): string {
  const base = config.baseUrl.replace(/\/+$/, '')
  return prefix ? `${base}/${prefix}` : base
}

function objectUrl(config: WebDavCredentials, key: string): string {
  const prefix = trimPrefix(config.prefix)
  return `${directoryUrl(config, prefix)}/${key}`
}

function authHeader(config: WebDavCredentials): string {
  return `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`
}

/**
 * pCloud speaks plain WebDAV, so a PROPFIND is the only way to list. The
 * response is parsed by pairing each href with the length that follows it.
 * shortcut: regex PROPFIND parsing, swap for an XML parser if a server nests
 * properties differently.
 */
function parsePropfind(xml: string): { key: string; size: number }[] {
  const entries: { key: string; size: number }[] = []
  const pattern = /<[^:>]*:?href>([^<]+)<\/[^:>]*:?href>[\s\S]*?<[^:>]*:?getcontentlength>(\d+)</g
  for (const match of xml.matchAll(pattern)) {
    if (!match[1] || !match[2]) continue
    const path = decodeURIComponent(match[1]).replace(/^\/+/, '').replace(/\/+$/, '')
    if (path) entries.push({ key: path, size: Number(match[2]) })
  }
  return entries
}

export function webDavStorage(config: WebDavCredentials, deps: { fetch?: Fetch } = {}): Storage {
  const doFetch: Fetch = deps.fetch ?? fetch
  const headers = { authorization: authHeader(config) }

  return {
    async put(key, body) {
      const response = await doFetch(objectUrl(config, key), { method: 'PUT', headers, body: toBody(body) })
      if (!response.ok) throw new Error(`webdav put failed: ${response.status}`)
    },
    async head(key) {
      const response = await doFetch(objectUrl(config, key), { method: 'HEAD', headers })
      if (response.status === 404) return null
      if (!response.ok) throw new Error(`webdav head failed: ${response.status}`)
      return { size: Number(response.headers.get('content-length') ?? 0) }
    },
    async list(prefix) {
      const body =
        '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/></d:prop></d:propfind>'
      const response = await doFetch(`${directoryUrl(config, trimPrefix(prefix))}/`, {
        method: 'PROPFIND',
        headers: { ...headers, depth: '1', 'content-type': 'application/xml' },
        body,
      })
      if (!response.ok) throw new Error(`webdav list failed: ${response.status}`)
      const marker = `${trimPrefix(prefix)}/`
      return parsePropfind(await response.text()).map((entry) => ({
        key: entry.key.startsWith(marker) ? entry.key.slice(marker.length) : entry.key,
        size: entry.size,
      }))
    },
    async remove(key) {
      const response = await doFetch(objectUrl(config, key), { method: 'DELETE', headers })
      if (!response.ok && response.status !== 404) throw new Error(`webdav delete failed: ${response.status}`)
    },
  }
}
