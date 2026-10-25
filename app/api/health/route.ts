import type { NextRequest } from 'next/server'
import { resolveApiKey } from '@/lib/auth/apikey'
import { withService } from '@/lib/db/tx'
import pkg from '../../../package.json'

export async function GET(request: NextRequest) {
  const header = request.headers.get('authorization') ?? ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  const user = token ? await resolveApiKey(token) : null

  // Anonymous callers get liveness only. Anything more would tell a stranger
  // how big the install is and whether its database is healthy.
  if (!user) return Response.json({ status: 'ok' })

  const started = Date.now()
  let database: { ok: boolean; latencyMs: number } = { ok: false, latencyMs: 0 }
  try {
    await withService((client) => client.query('select 1'))
    database = { ok: true, latencyMs: Date.now() - started }
  } catch (error) {
    console.error('health: database check failed', error)
  }

  return Response.json({
    status: database.ok ? 'ok' : 'degraded',
    version: pkg.version,
    uptimeSeconds: Math.round(process.uptime()),
    database,
    user: user.email,
  })
}
