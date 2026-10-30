import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth/context'
import { resolveProject } from '@/lib/projects/service'
import { ExportTooLarge, exportProject } from '@/lib/memory/export'

type Params = { params: Promise<{ slug: string }> }

/** The same file the API hands out, for a person signed in to the app. */
export async function GET(request: NextRequest, { params }: Params) {
  const user = await requireUser()
  const { slug } = await params
  const project = await resolveProject(user.id, { project: slug })
  const format = request.nextUrl.searchParams.get('format') === 'json' ? 'json' : 'markdown'

  try {
    const exported = await exportProject(user.id, project.id)
    return new Response(format === 'json' ? exported.json : exported.markdown, {
      headers: {
        'content-type': format === 'json' ? 'application/json; charset=utf-8' : 'text/markdown; charset=utf-8',
        'content-disposition': `attachment; filename="${exported.filename.replace(/\.md$/, format === 'json' ? '.json' : '.md')}"`,
      },
    })
  } catch (error) {
    if (error instanceof ExportTooLarge) {
      return Response.json({ error: error.message, code: error.code }, { status: 413 })
    }
    throw error
  }
}
