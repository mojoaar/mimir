import type { NextRequest } from 'next/server'
import { handleHealth } from '@/lib/http/health'

export async function GET(request: NextRequest) {
  return handleHealth(request)
}
