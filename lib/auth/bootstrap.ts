import type { Config } from '@/lib/config'
import { withAdmin } from '@/lib/db/tx'
import { hashPassword } from './password'

// Creates the first admin only when the install has no users at all. The guard
// runs once and never again, so a stale compose file cannot resurrect or
// overwrite an account later.
export async function ensureBootstrapAdmin(
  cfg: Pick<Config, 'adminEmail' | 'adminPassword'>,
  log: (msg: string) => void = console.log
): Promise<void> {
  const { adminEmail, adminPassword } = cfg
  if (!adminEmail || !adminPassword) {
    log('MIMIR_ADMIN_EMAIL / MIMIR_ADMIN_PASSWORD not set; skipping bootstrap admin.')
    return
  }

  await withAdmin(async (client) => {
    // Two replicas booting together must not both create an admin.
    await client.query("select pg_advisory_xact_lock(hashtext('mimir_bootstrap'))")
    const { rows } = await client.query<{ count: string }>(
      'select count(*)::text as count from users'
    )
    if (Number(rows[0]?.count ?? '0') > 0) return

    const passwordHash = await hashPassword(adminPassword)
    // totp_secret_enc stays NULL even when require_mfa is on: locking the only
    // admin out of a misconfigured install is worse than a second factor.
    await client.query(
      `insert into users (email, name, password_hash, status, role)
       values ($1, 'Admin', $2, 'active', 'admin')`,
      [adminEmail, passwordHash]
    )
    log(`Created bootstrap admin ${adminEmail}.`)
  })
}
