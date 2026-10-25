import type { NextRequest } from 'next/server'
import { withAudit } from '@/lib/http/audited'

export async function GET(request: NextRequest) {
  return withAudit(request, 'api.me', async (user) =>
    Response.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mfaEnabled: user.mfaEnabled,
    }),
  )
}
