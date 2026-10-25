import { BlockList, isIP } from 'node:net'

const cache = new Map<string, BlockList | 'all'>()

export function isCidr(value: string): boolean {
  const parts = value.split('/')
  if (parts.length !== 2) return false
  const [address, prefixRaw] = parts as [string, string]
  const family = isIP(address)
  if (family === 0 || !/^\d{1,3}$/.test(prefixRaw)) return false
  const prefix = Number(prefixRaw)
  return prefix >= 0 && prefix <= (family === 4 ? 32 : 128)
}

function listFor(cidr: string): BlockList | 'all' {
  const cached = cache.get(cidr)
  if (cached) return cached
  const [address, prefixRaw] = cidr.split('/') as [string, string]
  const prefix = Number(prefixRaw)
  let list: BlockList | 'all' = 'all'
  if (prefix > 0) {
    const block = new BlockList()
    // addSubnet returns nothing, so the instance is what gets cached.
    block.addSubnet(address, prefix, isIP(address) === 6 ? 'ipv6' : 'ipv4')
    list = block
  }
  cache.set(cidr, list)
  return list
}

export function matchesCidr(ip: string, cidr: string): boolean {
  if (isIP(ip) === 0 || !isCidr(cidr)) return false
  const list = listFor(cidr)
  if (list === 'all') return true
  return list.check(ip, isIP(ip) === 6 ? 'ipv6' : 'ipv4')
}

export function matchesAnyCidr(ip: string | null, list: readonly string[]): boolean {
  if (list.length === 0) return true
  if (ip === null) return false
  return list.some((cidr) => matchesCidr(ip, cidr))
}
