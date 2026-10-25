import type { Pool, PoolClient } from 'pg'
import { adminPool, appPool } from './pool'

async function inTransaction<T>(
  pool: Pool,
  userId: string | null,
  fn: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    // SET LOCAL (set_config's third argument) inside the transaction is what
    // keeps one user's rows invisible to the next request: the pool hands out
    // the same connections repeatedly, so a session-level variable would leak.
    if (userId !== null) {
      await client.query('select set_config($1, $2, true)', ['mimir.user_id', userId])
    }
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/** A request on behalf of one user. RLS applies. */
export function withUser<T>(
  userId: string,
  fn: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  return inTransaction(appPool, userId, fn)
}

/** Owner connection: migrations and maintenance. RLS does not apply. */
export function withAdmin<T>(fn: (tx: PoolClient) => Promise<T>): Promise<T> {
  return inTransaction(adminPool, null, fn)
}

/** App connection with no tenant set, for auth lookups by token hash. */
export function withService<T>(fn: (tx: PoolClient) => Promise<T>): Promise<T> {
  return inTransaction(appPool, null, fn)
}
