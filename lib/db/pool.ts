import { Pool } from 'pg'
import { getConfig } from '@/lib/config'

const config = getConfig()

export const appPool = new Pool({ connectionString: config.databaseUrl, max: 10 })

// Owner connection: migrations and pg_dump only. Never used to answer a request.
export const adminPool = new Pool({ connectionString: config.databaseAdminUrl, max: 4 })

export async function closePools(): Promise<void> {
  await Promise.all([appPool.end(), adminPool.end()])
}
