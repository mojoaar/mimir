import { withUser } from '@/lib/db/tx'
import { requireProjectRole } from '@/lib/projects/access'
import { embedText } from './embeddings'
import { normalisePath } from './path'
import { rrfFuse } from './rrf'

type Row = { path: string; title: string; summary: string | null }

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
 * Hybrid retrieval: one keyword list and, when an embedding provider is
 * configured, one vector list, fused with reciprocal rank fusion because
 * ts_rank_cd and cosine distance are not comparable numbers. A null query
 * vector (no provider, failure, timeout) leaves the keyword arm alone.
 */
export async function searchMemories(input: SearchInput): Promise<SearchHit[]> {
  const { userId, projectId, query } = input
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), CANDIDATES)
  await requireProjectRole(userId, projectId, 'read')

  const prefix =
    input.pathPrefix && input.pathPrefix.trim() !== '' ? normalisePath(input.pathPrefix) : null

  // Three seconds, not the ten a write can afford: a read should not hang on a
  // slow embedding provider when the keyword arm already has an answer.
  // An empty query must not become "the 50 nearest memories to nothing".
  const queryVector =
    query.trim() === '' ? null : await embedText(query, { timeoutMs: 3000 })

  const { keywordRows, vectorRows } = await withUser(userId, async (client) => {
    const keyword = await client.query<Row>(
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

    if (!queryVector) return { keywordRows: keyword.rows, vectorRows: [] }

    const vector = await client.query<Row>(
      `select m.path, m.title, m.summary
         from memories m
        where m.project_id = $1
          and m.deleted_at is null
          and ($2::text is null or m.path = $2 or starts_with(m.path, $2 || '/'))
          and m.embedding is not null
        order by m.embedding <=> $3::vector
        limit ${CANDIDATES}`,
      [projectId, prefix, queryVector],
    )

    return { keywordRows: keyword.rows, vectorRows: vector.rows }
  })

  const byPath = new Map([...keywordRows, ...vectorRows].map((row) => [row.path, row]))
  const keywordPaths = keywordRows.map((row) => row.path)
  const vectorPaths = vectorRows.map((row) => row.path)

  return rrfFuse(queryVector ? [keywordPaths, vectorPaths] : [keywordPaths])
    .slice(0, limit)
    .map((hit) => {
      const row = byPath.get(hit.id)!
      return { path: row.path, title: row.title, summary: row.summary, score: hit.score }
    })
}
