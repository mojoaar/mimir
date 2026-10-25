import { BlockList, isIP } from 'node:net'

const blockLists = new Map<string, BlockList>()
const exact = new Map<string, Set<string>>()

function trustedList(trustedProxies: string[]): { block: BlockList; bare: Set<string> } {
  const key = trustedProxies.join(',')
  let block = blockLists.get(key)
  let bare = exact.get(key)
  if (!block || !bare) {
    block = new BlockList()
    bare = new Set()
    for (const entry of trustedProxies) {
      if (isIP(entry) === 4) bare.add(entry)
      else if (isIP(entry) === 6) block.addAddress(entry, 'ipv6')
      else {
        const [address, prefix] = entry.split('/')
        if (address && prefix !== undefined) block.addSubnet(address, Number(prefix), 'ipv4')
      }
    }
    blockLists.set(key, block)
    exact.set(key, bare)
  }
  return { block, bare }
}

function isTrusted(peer: string, trustedProxies: string[]): boolean {
  const { block, bare } = trustedList(trustedProxies)
  if (bare.has(peer)) return true
  const family = isIP(peer)
  if (family === 0) return false
  return block.check(peer, family === 6 ? 'ipv6' : 'ipv4')
}

/**
 * The client address to use for the allowlist, rate limiting and auditing.
 *
 * `X-Forwarded-For` is trivially forged, so it is honoured only when the peer
 * that handed us the request is itself a trusted proxy. Next's server runtime
 * does not expose the socket peer (`peer` is null there), and this container
 * publishes its port on loopback only — the reverse proxy is the sole way in —
 * so a configured proxy list is itself the proof of trust in that case.
 */
export function clientIp(
  headers: Headers,
  trustedProxies: string[],
  peer: string | null,
): string | null {
  const canTrustHeader =
    (peer !== null && isTrusted(peer, trustedProxies)) ||
    (peer === null && trustedProxies.length > 0)

  if (!canTrustHeader) return peer

  const forwarded = headers.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  return first && isIP(first) ? first : peer
}
