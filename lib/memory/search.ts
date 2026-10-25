import { withUser } from '@/lib/db/tx'
import { requireProjectRole } from '@/lib/projects/access'
import { normalisePath } from './path'
import { rrfFuse } from './rrf'

export type SearchHit = {
  path: string
  title: string
  summary: string | null
  score: number
}

export type SearchInput = {
  userId: string
  projectId: string
  query: string
  pathPrefix?: string
  limit?: number
}

const CANDIDATES = 50
const DEFAULT_LIMIT = 20

/**
 * Hybrid retrieval. v0.1.0 has no embedding arm (no provider until plan 2), so
 * the keyword list goes through rrfFuse alone — the fusion path is exercised
 * now and the vector arm slots in beside it as a second list.
 */
export async function searchMemories(input: SearchInput): Promise<SearchHit[]> {
  const { userId, projectId, query } = input
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), CANDIDATES)
  await requireProjectRole(userId, projectId, 'read')

  const prefix =
    input.pathPrefix && input.pathPrefix.trim() !== '' ? normalisePath(input.pathPrefix) : null

  const rows = await withUser(userId, async (client) => {
    const { rows } = await client.query<{ path: string; title: string; summary: string | null }>(
      `with tsq as (
         select websearch_to_tsquery(p.fts_language::regconfig, $3) as q
         from projects p
         where p.id = $1
       )
       select m.path, m.title, m.summary
       from memories m, tsq
       where m.project_id = $1
         and m.deleted_at is null
         and ($2::text is null or m.path = $2 or starts_with(m.path, $2 || '/'))
         and m.tsv @@ tsq.q
       order by ts_rank_cd(m.tsv, tsq.q) desc, m.path
       limit ${CANDIDATES}`,
      [projectId, prefix, query],
    )
    return rows
  })

  const byPath = new Map(rows.map((row) => [row.path, row]))
  return rrfFuse([rows.map((row) => row.path)])
    .slice(0, limit)
    .map((hit) => {
      const row = byPath.get(hit.id)!
      return { path: row.path, title: row.title, summary: row.summary, score: hit.score }
    })
}
