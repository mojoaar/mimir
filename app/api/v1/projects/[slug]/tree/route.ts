import type { NextRequest } from 'next/server'
import { withApiAuth } from '@/lib/http/auth'
import { toResponse } from '@/lib/http/errors'
import { resolveProject } from '@/lib/projects/service'
import { treeMemory } from '@/lib/memory/service'

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { user } = await withApiAuth(request)
    const { slug } = await params
    const project = await resolveProject(user.id, { project: slug })

    const url = new URL(request.url)
    const prefix = url.searchParams.get('path') ?? ''
    const rawDepth = Number(url.searchParams.get('depth') ?? 3)
    const depth = Number.isInteger(rawDepth) && rawDepth > 0 ? rawDepth : 3

    return Response.json({ memories: await treeMemory(user.id, project.id, prefix, depth) })
  } catch (error) {
    return toResponse(error)
  }
}
