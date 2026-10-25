import type { NextRequest } from 'next/server'
import { withAudit } from '@/lib/http/audited'
import { resolveProject } from '@/lib/projects/service'
import { restoreVersion } from '@/lib/memory/versions'

type Params = { params: Promise<{ slug: string; id: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  return withAudit(request, 'memory.restore_version', async (user) => {
    const { slug, id } = await params
    const project = await resolveProject(user.id, { project: slug })

    const result = await restoreVersion(user.id, project.id, id)
    if (!result.restored) {
      return Response.json({ error: 'not_found', code: 'not_found' }, { status: 404 })
    }

    return Response.json(result)
  }, { detail: { via: 'api' } })
}
