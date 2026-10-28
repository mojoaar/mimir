import { withUser } from '@/lib/db/tx'
import { requireProjectRole } from '@/lib/projects/access'
import { embedText } from './embeddings'
import { normalisePath } from './path'
import { rrfFuse } from './rrf'

type Row = {
  path: string
  title: string
  summary: string | null
  excerpt: string | null
  project_slug: string
  project_name: string
}

export type SearchHit = {
  path: string
  title: string
  summary: string | null
  /** The body line around the matched words, filled only for a search across projects. */
  excerpt: string | null
  projectSlug: string
  projectName: string
  score: number
}

export type SearchInput = {
  userId: string
  /** Omit to search every project the caller can read. */
  projectId?: string
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
 *
 * Without a projectId both arms run across every project the caller can read.
 * That needs no extra authorisation: the memories policy is
 * `can_access_project(project_id)`, so the rows that come back are the rows
 * they were always allowed to see. A hit then carries its project, because a
 * path is only unique inside one.
 */
export async function searchMemories(input: SearchInput): Promise<SearchHit[]> {
  const { userId, projectId, query } = input
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), CANDIDATES)
  if (projectId) await requireProjectRole(userId, projectId, 'read')

  const prefix =
    input.pathPrefix && input.pathPrefix.trim() !== '' ? normalisePath(input.pathPrefix) : null

  // Three seconds, not the ten a write can afford: a read should not hang on a
  // slow embedding provider when the keyword arm already has an answer.
  // An empty query must not become "the 50 nearest memories to nothing".
  const queryVector =
    query.trim() === ''
      ? null
      : ((await embedText(query, { timeoutMs: 3000, inputType: 'query', purpose: 'embed.search' }))
          ?.literal ?? null)

  const { keywordRows, vectorRows } = await withUser(userId, async (client) => {
    // The text config is per project, so the query has to join projects rather
    // than read one language up front. ts_headline then marks the matched words
    // with <b> by default, which is stripped: the caller renders plain text.
    const keyword = await client.query<Row>(
      `select m.path, m.title, m.summary,
              case when $1::uuid is null
                   then regexp_replace(
                          ts_headline(p.fts_language::regconfig, left(m.body, 4000),
                                      websearch_to_tsquery(p.fts_language::regconfig, $2),
                                      'MaxWords=18, MinWords=6'),
                          '</?b>', '', 'g')
                   else null
              end as excerpt,
              p.slug as project_slug, p.name as project_name
         from memories m
         join projects p on p.id = m.project_id
        where m.deleted_at is null
          and ($1::uuid is null or m.project_id = $1)
          and ($3::text is null or m.path = $3 or starts_with(m.path, $3 || '/'))
          and m.tsv @@ websearch_to_tsquery(p.fts_language::regconfig, $2)
        order by ts_rank_cd(m.tsv, websearch_to_tsquery(p.fts_language::regconfig, $2)) desc, m.path
        limit ${CANDIDATES}`,
      [projectId ?? null, query, prefix],
    )

    if (!queryVector) return { keywordRows: keyword.rows, vectorRows: [] }

    const vector = await client.query<Row>(
      `select m.path, m.title, m.summary, null::text as excerpt,
              p.slug as project_slug, p.name as project_name
         from memories m
         join projects p on p.id = m.project_id
        where m.deleted_at is null
          and ($1::uuid is null or m.project_id = $1)
          and ($2::text is null or m.path = $2 or starts_with(m.path, $2 || '/'))
          and m.embedding is not null
        order by m.embedding <=> $3::vector
        limit ${CANDIDATES}`,
      [projectId ?? null, prefix, queryVector],
    )

    return { keywordRows: keyword.rows, vectorRows: vector.rows }
  })

  // Two projects can hold the same path, so the fuse key is the pair, not the path.
  const key = (row: Row) => `${row.project_slug}\u0000${row.path}`
  const byKey = new Map([...keywordRows, ...vectorRows].map((row) => [key(row), row]))
  const keywordKeys = keywordRows.map(key)
  const vectorKeys = vectorRows.map(key)

  return rrfFuse(queryVector ? [keywordKeys, vectorKeys] : [keywordKeys])
    .slice(0, limit)
    .map((hit) => {
      const row = byKey.get(hit.id)!
      return {
        path: row.path,
        title: row.title,
        summary: row.summary,
        excerpt: row.excerpt,
        projectSlug: row.project_slug,
        projectName: row.project_name,
        score: hit.score,
      }
    })
}
