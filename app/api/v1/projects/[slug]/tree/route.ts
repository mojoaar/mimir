import type { NextRequest } from 'next/server'
import { withAudit } from '@/lib/http/audited'
import { resolveProject } from '@/lib/projects/service'
import { treeMemory } from '@/lib/memory/service'

type Params = { params: Promise<{ slug: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  return withAudit(request, 'memory.read', async (user) => {
    const { slug } = await params
    const project = await resolveProject(user.id, { project: slug })

    const url = new URL(request.url)
    const prefix = url.searchParams.get('path') ?? ''
    const rawDepth = Number(url.searchParams.get('depth') ?? 3)
    const depth = Number.isInteger(rawDepth) && rawDepth > 0 ? rawDepth : 3

    return Response.json({ memories: await treeMemory(user.id, project.id, prefix, depth) })
  })
}
