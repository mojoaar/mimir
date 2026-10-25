import { hash, verify } from '@node-rs/argon2'

// 64 MiB / t=3 / p=1: strong enough for a homelab box, cheap enough that a
// login does not block the single Node process for long.
const OPTIONS = { memoryCost: 65536, timeCost: 3, parallelism: 1 }

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS)
}

export async function verifyPassword(digest: string, plain: string): Promise<boolean> {
  try {
    return await verify(digest, plain)
  } catch {
    return false // a malformed hash is a failed login, not a 500
  }
}
