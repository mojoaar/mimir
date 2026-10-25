import type { NextRequest } from 'next/server'
import { withAudit } from '@/lib/http/audited'
import { resolveProject } from '@/lib/projects/service'
import { buildDigest } from '@/lib/memory/digest'

type Params = { params: Promise<{ slug: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  return withAudit(request, 'memory.read', async (user) => {
    const { slug } = await params
    const project = await resolveProject(user.id, { project: slug })

    const raw = Number(new URL(request.url).searchParams.get('budget_tokens'))
    const budgetTokens = Number.isInteger(raw) && raw > 0 ? raw : undefined

    return Response.json(await buildDigest({ userId: user.id, projectId: project.id, budgetTokens }))
  })
}
