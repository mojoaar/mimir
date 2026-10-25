import type { NextRequest } from 'next/server'
import { withApiAuth } from '@/lib/http/auth'
import { toResponse } from '@/lib/http/errors'
import { resolveProject } from '@/lib/projects/service'
import { buildDigest } from '@/lib/memory/digest'

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { user } = await withApiAuth(request)
    const { slug } = await params
    const project = await resolveProject(user.id, { project: slug })

    const raw = Number(new URL(request.url).searchParams.get('budget_tokens'))
    const budgetTokens = Number.isInteger(raw) && raw > 0 ? raw : undefined

    return Response.json(await buildDigest({ userId: user.id, projectId: project.id, budgetTokens }))
  } catch (error) {
    return toResponse(error)
  }
}
