import type { NextRequest } from 'next/server'
import { withAudit } from '@/lib/http/audited'
import { listProjects } from '@/lib/projects/service'

export async function GET(request: NextRequest) {
  return withAudit(request, 'project.list', async (user) =>
    Response.json({ projects: await listProjects(user.id) }),
  )
}
