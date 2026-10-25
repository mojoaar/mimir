import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'

/**
 * A provider base URL is typed by a user and then fetched by the server, so it
 * is an SSRF surface: without this check, an invited user can point Mimir at
 * the metadata service or at Postgres and read the answer out of the error.
 * The two documented homelab hosts are allowed by name because they are the
 * intended setup, and because an operator cannot reach them any other way.
 */
export const PRIVATE_HOST_ALLOWLIST = ['host.docker.internal', 'ollama']

export type UrlCheck = { ok: true } | { ok: false; reason: string }

const UNSUPPORTED = 'the base URL must start with http:// or https://'

export function checkProviderUrl(raw: string, options: { allowPrivate?: boolean } = {}): UrlCheck {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return { ok: false, reason: `'${raw}' is not a URL; ${UNSUPPORTED}` }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `'${raw}' is not a URL; ${UNSUPPORTED}` }
  }

  // A trailing dot is the same name to the resolver ("localhost." is loopback).
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '')

  if (PRIVATE_HOST_ALLOWLIST.includes(host)) {
    return options.allowPrivate === false
      ? { ok: false, reason: `'${host}' is inside the local network; use a public address` }
      : { ok: true }
  }
  if (isPrivateHost(host)) {
    return { ok: false, reason: `'${host}' is inside the local network; use a public address` }
  }

  return { ok: true }
}

/** `[::ffff:7f00:1]` and `[64:ff9b::7f00:1]` are 127.0.0.1 in IPv6 clothing. */
function embeddedIpv4(host: string): string | null {
  const match = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host)
  if (!match) return null
  const [hi, lo] = [parseInt(match[1] ?? '0', 16), parseInt(match[2] ?? '0', 16)]
  return [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.')
}

function isPrivateHost(host: string): boolean {
  if (host === '' || host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '0.0.0.0') return true

  const embedded = embeddedIpv4(host)
  if (embedded) return isPrivateHost(embedded)

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    if (a === 127 || a === 10 || a === 0) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true
    return false
  }

  const v6 = host.toLowerCase()
  if (v6 === '::1' || v6 === '::') return true
  if (/^fe[89ab]/.test(v6)) return true // fe80::/10, link local
  if (/^f[cd]/.test(v6)) return true // fc00::/7, unique local
  return false
}

/**
 * A save-time string check cannot see where a DNS name points: `169.254.169.254.nip.io`
 * is public text and a private address. Resolve it once when the provider is saved.
 * A name that does not resolve here is allowed — internal DNS is the operator's
 * business, and this is a guard against the obvious, not a firewall.
 */
export async function assertPublicProviderHost(
  raw: string,
  resolve: typeof lookup = lookup,
): Promise<void> {
  const check = checkProviderUrl(raw)
  if (!check.ok) throw new Error(check.reason)

  const host = new URL(raw.trim()).hostname.replace(/^\[|\]$/g, '').replace(/\.+$/, '')
  if (PRIVATE_HOST_ALLOWLIST.includes(host) || isIP(host) !== 0) return

  let addresses: { address: string }[]
  try {
    addresses = await resolve(host, { all: true })
  } catch {
    return
  }
  for (const { address } of addresses) {
    if (isPrivateHost(address)) {
      throw new Error(`'${host}' resolves to a private address (${address}); use a public endpoint`)
    }
  }
}
