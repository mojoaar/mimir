import type { NextRequest } from 'next/server'
import { withAudit } from '@/lib/http/audited'
import { resolveProject } from '@/lib/projects/service'
import { listVersions } from '@/lib/memory/versions'

type Params = { params: Promise<{ slug: string }> }

// A path is a query parameter rather than path segments: Next requires a
// catch-all to be the last part of a URL, and the memory route already owns
// `/memory/[...path]`.
export async function GET(request: NextRequest, { params }: Params) {
  return withAudit(request, 'memory.read', async (user) => {
    const { slug } = await params
    const path = request.nextUrl.searchParams.get('path')
    if (!path) {
      return Response.json({ error: 'path is required', code: 'invalid_params' }, { status: 400 })
    }

    const project = await resolveProject(user.id, { project: slug })
    return Response.json({ versions: await listVersions(user.id, project.id, path) })
  })
}
