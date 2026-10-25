import type { NextRequest } from 'next/server'
import { withAudit } from '@/lib/http/audited'
import { resolveProject } from '@/lib/projects/service'
import { listVersions } from '@/lib/memory/versions'

type Params = { params: Promise<{ slug: string; path: string[] }> }

export async function GET(request: NextRequest, { params }: Params) {
  return withAudit(request, 'memory.read', async (user) => {
    const { slug, path } = await params
    const project = await resolveProject(user.id, { project: slug })

    return Response.json({ versions: await listVersions(user.id, project.id, path.join('/')) })
  })
}
