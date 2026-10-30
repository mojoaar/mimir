import { withUser } from '@/lib/db/tx'
import { requireProjectRole } from '@/lib/projects/access'

export const MAX_EXPORT_BYTES = 16 * 1024 * 1024
export const MAX_EXPORT_MEMORIES = 5000

export class ExportTooLarge extends Error {
  readonly code = 'too_large'

  constructor() {
    super('this project is too large to export in one file')
    this.name = 'ExportTooLarge'
  }
}

export type ProjectExport = { markdown: string; json: string; filename: string }

type Row = {
  path: string
  title: string
  summary: string | null
  body: string
  kind: string
  client: string | null
  session: string | null
  updated_at: Date
}

/**
 * Both caps are decided from one counting query, before a single body is
 * loaded: a huge project must refuse cheaply, not build a huge string first.
 */
export async function exportProject(userId: string, projectId: string): Promise<ProjectExport> {
  await requireProjectRole(userId, projectId, 'read')

  const meta = await withUser(userId, async (client) => {
    const { rows } = await client.query<{
      slug: string
      name: string
      repo_key: string | null
      memories: number
      bytes: number
    }>(
      `select p.slug, p.name, p.repo_key,
              (select count(*)::int from memories m
                where m.project_id = p.id and m.deleted_at is null) as memories,
              (select coalesce(sum(length(m.body)), 0)::int from memories m
                where m.project_id = p.id and m.deleted_at is null) as bytes
         from projects p
        where p.id = $1`,
      [projectId],
    )
    return rows[0] ?? null
  })

  if (!meta) throw new ExportTooLarge()
  if (meta.memories > MAX_EXPORT_MEMORIES || meta.bytes > MAX_EXPORT_BYTES) throw new ExportTooLarge()

  const rows = await withUser(userId, async (client) => {
    const { rows } = await client.query<Row>(
      `select path, title, summary, body, kind, client, session, updated_at
         from memories
        where project_id = $1 and deleted_at is null
        order by path`,
      [projectId],
    )
    return rows
  })

  const markdown = [`# ${meta.name}`, '', ...rows.flatMap((row) => [
    `## ${row.path}`,
    '',
    `*${row.title}*`,
    '',
    row.body,
    '',
    '---',
    '',
  ])].join('\n')

  const json = JSON.stringify(
    {
      project: { slug: meta.slug, name: meta.name },
      repoKey: meta.repo_key,
      exportedAt: new Date().toISOString(),
      memoryCount: rows.length,
      memories: rows.map((row) => ({
        path: row.path,
        title: row.title,
        summary: row.summary,
        body: row.body,
        kind: row.kind,
        client: row.client,
        session: row.session,
        updatedAt: row.updated_at.toISOString(),
      })),
    },
    null,
    2,
  )

  return { markdown, json, filename: `${meta.slug}.md` }
}
