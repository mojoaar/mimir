import { withService } from '@/lib/db/tx'

/**
 * The id behind an address, for granting access. Only an active user can be
 * granted: a disabled account must not quietly regain access by being added.
 */
export async function findActiveUserIdByEmail(email: string): Promise<string | null> {
  const address = email.trim().toLowerCase()
  if (!address) return null

  return withService(async (client) => {
    const found = await client.query<{ id: string }>(
      `select id from users where lower(email::text) = $1 and status = 'active' limit 1`,
      [address],
    )
    return found.rows[0]?.id ?? null
  })
}
