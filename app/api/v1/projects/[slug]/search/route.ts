import type { NextRequest } from 'next/server'
import { withApiAuth } from '@/lib/http/auth'
import { toResponse } from '@/lib/http/errors'
import { resolveProject } from '@/lib/projects/service'
import { searchMemories } from '@/lib/memory/search'

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { user } = await withApiAuth(request)
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
  } catch (error) {
    return toResponse(error)
  }
}
