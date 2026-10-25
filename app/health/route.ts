import type { NextRequest } from 'next/server'
import { handleHealth } from '@/lib/http/health'

// The spec and the Docker healthcheck both name /health; /api/health is the
// long-standing path. One handler, two doors.
export async function GET(request: NextRequest) {
  return handleHealth(request)
}
