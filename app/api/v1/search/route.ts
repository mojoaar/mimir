import type { NextRequest } from 'next/server'
import { withAudit } from '@/lib/http/audited'
import { readJson } from '@/lib/http/limit'
import { searchMemories } from '@/lib/memory/search'

/**
 * The same search as a project's own route, without a project: RLS decides
 * what the caller can read, so a key with one grant sees one project.
 */
export async function POST(request: NextRequest) {
  return withAudit(request, 'memory.read', async (user) => {
    const input = await readJson<{
      query?: unknown
      path_prefix?: unknown
      limit?: unknown
    }>(request)
    if (typeof input.query !== 'string') {
      return Response.json({ error: 'query must be a string', code: 'invalid_params' }, { status: 400 })
    }

    const hits = await searchMemories({
      userId: user.id,
      query: input.query,
      pathPrefix: typeof input.path_prefix === 'string' ? input.path_prefix : undefined,
      limit: typeof input.limit === 'number' ? input.limit : undefined,
    })
    return Response.json({ results: hits })
  })
}
