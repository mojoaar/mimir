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
        const family = address ? isIP(address) : 0
        if (address && prefix !== undefined && family !== 0) {
          block.addSubnet(address, Number(prefix), family === 6 ? 'ipv6' : 'ipv4')
        }
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
 * `X-Forwarded-For` is trivially forged, so a chain is walked right to left
 * and the first address that is not itself a trusted proxy is the client.
 * nginx appends with `$proxy_add_x_forwarded_for`, so anything a stranger
 * sends ends up on the left and can never be reached by this walk.
 *
 * Next's server runtime does not expose the socket peer (`peer` is null
 * there), and this container publishes its port on loopback only — the
 * reverse proxy is the sole way in. With an unknown peer we therefore take
 * the last hop, the one the proxy appended.
 */
export function clientIp(
  headers: Headers,
  trustedProxies: string[],
  peer: string | null,
): string | null {
  if (trustedProxies.length === 0) return peer

  const hops = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((hop) => hop.trim())
    .filter((hop) => isIP(hop) !== 0)

  if (hops.length === 0) return peer

  // Unknown peer: only the hop our own proxy appended is trustworthy.
  if (peer === null) return hops[hops.length - 1] ?? peer

  if (!isTrusted(peer, trustedProxies)) return peer

  for (let i = hops.length - 1; i >= 0; i--) {
    const hop = hops[i]
    if (hop && !isTrusted(hop, trustedProxies)) return hop
  }

  return peer
}
