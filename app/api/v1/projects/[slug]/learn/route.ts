import type { NextRequest } from 'next/server'
import { withAudit } from '@/lib/http/audited'
import { readJson } from '@/lib/http/limit'
import { resolveProject } from '@/lib/projects/service'
import { sendJob } from '@/lib/jobs/boss'

type Params = { params: Promise<{ slug: string }> }

const MAX_TRANSCRIPT = 32768
const MAX_HINT = 500

export async function POST(request: NextRequest, { params }: Params) {
  return withAudit(
    request,
    'memory.learn',
    async (user) => {
      const { slug } = await params
      const project = await resolveProject(user.id, { project: slug })
      const input = await readJson<{ transcript?: unknown; hint?: unknown }>(request, MAX_TRANSCRIPT * 4 + 4096)

      if (typeof input.transcript !== 'string' || input.transcript.trim() === '') {
        return Response.json(
          { error: 'transcript must be a non-empty string', code: 'invalid_params' },
          { status: 400 },
        )
      }

      const id = await sendJob('learn', {
        projectId: project.id,
        transcript: input.transcript.slice(0, MAX_TRANSCRIPT),
        hint: typeof input.hint === 'string' ? input.hint.slice(0, MAX_HINT) : null,
      })

      // The queue can be down while the app still serves reads, so say which
      // it was rather than claiming success.
      return Response.json({ queued: id !== null })
    },
    { maxBytes: MAX_TRANSCRIPT * 4 + 4096 },
  )
}
