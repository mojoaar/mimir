import { withApiAuth } from '@/lib/http/auth'
import { toResponse } from '@/lib/http/errors'

export async function GET(request: Request) {
  try {
    const { user } = await withApiAuth(request)
    return Response.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mfaEnabled: user.mfaEnabled,
    })
  } catch (error) {
    return toResponse(error)
  }
}
