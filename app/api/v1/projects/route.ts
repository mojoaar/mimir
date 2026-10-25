import { withApiAuth } from '@/lib/http/auth'
import { toResponse } from '@/lib/http/errors'
import { listProjects } from '@/lib/projects/service'

export async function GET(request: Request) {
  try {
    const { user } = await withApiAuth(request)
    return Response.json({ projects: await listProjects(user.id) })
  } catch (error) {
    return toResponse(error)
  }
}
