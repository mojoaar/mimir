import type { NextRequest } from 'next/server'
import { withAudit } from '@/lib/http/audited'
import { resolveProject } from '@/lib/projects/service'
import { searchMemories } from '@/lib/memory/search'

type Params = { params: Promise<{ slug: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  return withAudit(request, 'memory.read', async (user) => {
    const { slug } = await params
    const project = await resolveProject(user.id, { project: slug })

    const input = (await request.json()) as {
      query?: unknown
      path_prefix?: unknown
      limit?: unknown
    }
    if (typeof input.query !== 'string') {
      return Response.json({ error: 'query must be a string', code: 'invalid_params' }, { status: 400 })
    }

    const hits = await searchMemories({
      userId: user.id,
      projectId: project.id,
      query: input.query,
      pathPrefix: typeof input.path_prefix === 'string' ? input.path_prefix : undefined,
      limit: typeof input.limit === 'number' ? input.limit : undefined,
    })
    return Response.json({ results: hits })
  })
}
