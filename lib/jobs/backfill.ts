import { withAdmin } from '@/lib/db/tx'
import { EMBED_TEXT_LIMIT, toVectorLiteral } from '@/lib/memory/embeddings'
import { EMBEDDING_DIM } from '@/lib/settings/embedding'
import { embed } from '@/lib/providers/client'
import { resolveEmbeddingProvider } from '@/lib/providers/resolve'
import { registerWorker } from './boss'

const BATCH = 32
const MAX_ROWS = 2000

export type BackfillData = { projectId?: string }

export type BackfillResult = { embedded: number }

type Row = { id: string; path: string; title: string | null; body: string }

export async function runBackfill(data: BackfillData): Promise<BackfillResult> {
  const provider = await resolveEmbeddingProvider()
  if (!provider) return { embedded: 0 }

  let embedded = 0
  while (embedded < MAX_ROWS) {
    const rows = await nextBatch(data.projectId)
    if (rows.length === 0) break

    for (const row of rows) {
      const text = [row.path, row.title ?? '', row.body].join('\n').slice(0, EMBED_TEXT_LIMIT)
      let vector: number[]
      try {
        const [first] = await embed(provider, [text], {
          dimension: EMBEDDING_DIM,
          inputType: 'document',
        })
        if (!first) throw new Error('provider returned no vector')
        vector = first
      } catch (error) {
        console.log(`backfill stopped (${(error as Error).message})`)
        return { embedded }
      }
      if (!vector || vector.length !== EMBEDDING_DIM) {
        console.log('backfill stopped (provider returned the wrong dimension)')
        return { embedded }
      }
      await store(row.id, vector)
      embedded += 1
    }
  }

  return { embedded }
}

// A job is a system actor with no session, so RLS would hide every row: read and
// write through the owner connection, which is not subject to the policies.
async function nextBatch(projectId: string | undefined): Promise<Row[]> {
  return withAdmin(async (client) => {
    const { rows } = await client.query<Row>(
      `select id, path, title, body
         from memories
        where embedding is null
          and deleted_at is null
          ${projectId ? 'and project_id = $1' : ''}
        order by updated_at
        limit ${BATCH}`,
      projectId ? [projectId] : [],
    )
    return rows
  })
}

async function store(id: string, values: number[]): Promise<void> {
  await withAdmin(async (client) => {
    await client.query('update memories set embedding = $2::vector where id = $1', [
      id,
      toVectorLiteral(values),
    ])
  })
}

registerWorker('backfill', async (data) => {
  await runBackfill(data as BackfillData)
})
