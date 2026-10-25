import type { NextRequest } from 'next/server'
import { withApiAuth } from '@/lib/http/auth'
import { toResponse } from '@/lib/http/errors'
import { resolveProject } from '@/lib/projects/service'
import { deleteMemory, readMemory, writeMemory } from '@/lib/memory/service'

type Params = { params: Promise<{ slug: string; path: string[] }> }

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { user } = await withApiAuth(request)
    const { slug, path } = await params
    const project = await resolveProject(user.id, { project: slug })

    const memory = await readMemory(user.id, project.id, path.join('/'))
    if (!memory) return Response.json({ error: 'not_found', code: 'not_found' }, { status: 404 })
    return Response.json(memory)
  } catch (error) {
    return toResponse(error)
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { user } = await withApiAuth(request)
    const { slug, path } = await params
    const project = await resolveProject(user.id, { project: slug })

    const input = (await request.json()) as { body?: unknown; title?: unknown; kind?: unknown }
    if (typeof input.body !== 'string') {
      return Response.json({ error: 'body must be a string', code: 'invalid_params' }, { status: 400 })
    }

    const result = await writeMemory({
      userId: user.id,
      projectId: project.id,
      path: path.join('/'),
      body: input.body,
      title: typeof input.title === 'string' ? input.title : undefined,
      kind: typeof input.kind === 'string' ? input.kind : undefined,
      source: 'agent',
    })
    return Response.json(result)
  } catch (error) {
    return toResponse(error)
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { user } = await withApiAuth(request)
    const { slug, path } = await params
    const project = await resolveProject(user.id, { project: slug })

    const deleted = await deleteMemory(user.id, project.id, path.join('/'))
    if (!deleted) return Response.json({ error: 'not_found', code: 'not_found' }, { status: 404 })
    return Response.json({ deleted: true })
  } catch (error) {
    return toResponse(error)
  }
}
