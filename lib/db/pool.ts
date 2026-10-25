import { Pool } from 'pg'
import { getConfig } from '../config'

// Pools are created on first use, not at import: `next build` collects page
// metadata with no environment, so reading config here would fail the build.
let app: Pool | null = null
let admin: Pool | null = null

/** Runtime pool: connects as mimir_app, subject to RLS. */
export function appPool(): Pool {
  app ??= new Pool({ connectionString: getConfig().databaseUrl, max: 10 })
  return app
}

/** Owner pool: migrations, pg_dump and auth lookups that cannot be tenant-scoped. */
export function adminPool(): Pool {
  admin ??= new Pool({ connectionString: getConfig().databaseAdminUrl, max: 4 })
  return admin
}

export async function closePools(): Promise<void> {
  const open = [app, admin].filter((p): p is Pool => p !== null)
  await Promise.all(open.map((p) => p.end()))
  app = null
  admin = null
}
