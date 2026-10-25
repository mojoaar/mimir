import type { NextRequest } from 'next/server'
import { withAudit } from '@/lib/http/audited'
import { resolveProject } from '@/lib/projects/service'
import { ingestFiles, type IngestFile } from '@/lib/memory/ingest'

type Params = { params: Promise<{ slug: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  return withAudit(request, 'memory.write', async (user) => {
    const { slug } = await params
    const project = await resolveProject(user.id, { project: slug })

    const input = (await request.json()) as { files?: unknown; prefix?: unknown }
    if (!Array.isArray(input.files)) {
      return Response.json({ error: 'files must be an array', code: 'invalid_params' }, { status: 400 })
    }

    return Response.json(
      await ingestFiles({
        userId: user.id,
        projectId: project.id,
        files: input.files as IngestFile[],
        prefix: typeof input.prefix === 'string' ? input.prefix : undefined,
      }),
    )
  })
}
