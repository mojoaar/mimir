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

// A real argon2id digest of a string nobody uses as a password. Verifying
// against it costs exactly one key derivation and always fails, which is the
// point: an unknown email must cost the same as a wrong password.
const TIMING_DIGEST =
  '$argon2id$v=19$m=65536,t=3,p=1$Q3IYxY4I9R97SAVpgUK8Jw$L7eni4PWTllz6N8NqLpWV2wCPEQKjepDkgWH/IGK9Io'

export async function verifyPasswordForTiming(): Promise<void> {
  await verifyPassword(TIMING_DIGEST, 'mimir-timing-placeholder')
}

