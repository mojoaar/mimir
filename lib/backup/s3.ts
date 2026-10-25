import { AwsV4Signer } from 'aws4fetch'
import type { S3Credentials } from '@/lib/settings/backup-settings'
import type { Storage } from './storage'

type Fetch = typeof fetch

/** BodyInit in this project does not accept Node's Buffer or a shared-array view. */
function toBody(body: Buffer | null | undefined): ArrayBuffer | undefined {
  if (!body) return undefined
  const copy = new ArrayBuffer(body.byteLength)
  new Uint8Array(copy).set(body)
  return copy
}

type SendInit = { method: string; body?: Buffer }

function trimPrefix(prefix: string): string {
  return prefix.replace(/^\/+|\/+$/g, '')
}

function objectUrl(config: S3Credentials, key: string): string {
  const endpoint = config.endpoint.replace(/\/+$/, '')
  if (config.pathStyle) return `${endpoint}/${config.bucket}/${key}`
  const url = new URL(endpoint)
  return `${url.protocol}//${config.bucket}.${url.host}/${key}`
}

function bucketUrl(config: S3Credentials): string {
  const endpoint = config.endpoint.replace(/\/+$/, '')
  if (config.pathStyle) return `${endpoint}/${config.bucket}`
  const url = new URL(endpoint)
  return `${url.protocol}//${config.bucket}.${url.host}`
}

function fullKey(config: S3Credentials, key: string): string {
  const prefix = trimPrefix(config.prefix)
  return prefix ? `${prefix}/${key}` : key
}

/**
 * The listing is parsed with a regex rather than an XML parser: the
 * ListBucketResult shape is fixed and namespaced variants do not occur on the
 * providers this targets.
 * shortcut: regex listing, swap for an XML parser if a provider returns a
 * different document shape.
 */
function parseListing(xml: string): { key: string; size: number }[] {
  const entries: { key: string; size: number }[] = []
  const pattern = /<Key>([^<]+)<\/Key>[\s\S]*?<Size>(\d+)<\/Size>/g
  for (const match of xml.matchAll(pattern)) {
    if (match[1] && match[2]) entries.push({ key: match[1], size: Number(match[2]) })
  }
  return entries
}

export function s3Storage(config: S3Credentials, deps: { fetch?: Fetch } = {}): Storage {
  const doFetch: Fetch = deps.fetch ?? fetch

  // Signed here rather than through AwsClient.fetch so the transport is
  // injectable and the payload hash always covers the bytes we actually send.
  async function send(url: string, init: SendInit): Promise<Response> {
    const signed = await new AwsV4Signer({
      method: init.method,
      url,
      headers: {},
      body: toBody(init.body) ?? null,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: 's3',
      region: config.region,
    }).sign()
    return doFetch(signed.url.toString(), {
      method: signed.method,
      headers: signed.headers,
      body: toBody(init.body),
    })
  }

  return {
    async put(key, body) {
      const response = await send(objectUrl(config, fullKey(config, key)), { method: 'PUT', body })
      if (!response.ok) throw new Error(`s3 put failed: ${response.status}`)
    },
    async head(key) {
      const response = await send(objectUrl(config, fullKey(config, key)), { method: 'HEAD' })
      if (response.status === 404) return null
      if (!response.ok) throw new Error(`s3 head failed: ${response.status}`)
      return { size: Number(response.headers.get('content-length') ?? 0) }
    },
    async list(prefix) {
      const full = trimPrefix(prefix)
      const query = new URLSearchParams({ 'list-type': '2', prefix: full ? `${full}/` : '' })
      const response = await send(`${bucketUrl(config)}?${query.toString()}`, { method: 'GET' })
      if (!response.ok) throw new Error(`s3 list failed: ${response.status}`)
      const marker = full ? `${full}/` : ''
      return parseListing(await response.text()).map((entry) => ({
        key: entry.key.startsWith(marker) ? entry.key.slice(marker.length) : entry.key,
        size: entry.size,
      }))
    },
    async remove(key) {
      const response = await send(objectUrl(config, fullKey(config, key)), { method: 'DELETE' })
      if (!response.ok && response.status !== 404) throw new Error(`s3 delete failed: ${response.status}`)
    },
  }
}
