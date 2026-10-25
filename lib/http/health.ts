import { resolveApiKey } from '@/lib/auth/apikey'
import { withService } from '@/lib/db/tx'
import { connection } from 'next/server'
import pkg from '../../package.json'

export type DatabaseCheck = { ok: boolean; latencyMs: number }

export type HealthUser = { email: string }

/**
 * Anonymous callers learn whether the install is up, nothing more; the
 * authenticated answer carries the detail. The HTTP status is the same either
 * way, because a healthcheck reads it.
 */
export function healthPayload(
  database: DatabaseCheck,
  meta: { version: string; uptimeSeconds: number },
  user: HealthUser | null,
): { body: Record<string, unknown>; status: number } {
  const status = database.ok ? 200 : 503

  if (!user) {
    return { body: { status: database.ok ? 'ok' : 'unavailable' }, status }
  }

  return {
    body: {
      status: database.ok ? 'ok' : 'degraded',
      version: meta.version,
      uptimeSeconds: meta.uptimeSeconds,
      database,
      user: user.email,
    },
    status,
  }
}

async function checkDatabase(): Promise<DatabaseCheck> {
  const started = Date.now()
  try {
    await withService((client) => client.query('select 1'))
    return { ok: true, latencyMs: Date.now() - started }
  } catch (error) {
    console.error('health: database check failed', error)
    return { ok: false, latencyMs: Date.now() - started }
  }
}

/**
 * The handler lives here so both /health and /api/health are thin wrappers that
 * still read `request`: a route that only re-exports another handler is
 * prerendered at build time, where there is no database to check.
 */
export async function handleHealth(request: Request): Promise<Response> {
  // Next 16 prerenders route handlers that read no dynamic API, and a frozen
  // health answer is worse than none: this must run per request. Outside a
  // request (integration tests calling the handler directly) there is nothing
  // to opt out of, and Next throws rather than returning.
  try {
    await connection()
  } catch {
    /* no request scope */
  }
  const database = await checkDatabase()

  const header = request.headers.get('authorization') ?? ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  const user = token ? await resolveApiKey(token) : null

  const { body, status } = healthPayload(
    database,
    { version: pkg.version, uptimeSeconds: Math.round(process.uptime()) },
    user,
  )
  return Response.json(body, { status })
}
