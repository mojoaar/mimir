import { withUser } from '@/lib/db/tx'
import { requireProjectRole } from '@/lib/projects/access'

export type Digest = {
  text: string
  memoryCount: number
  truncated: boolean
}

export type DigestInput = {
  userId: string
  projectId: string
  budgetTokens?: number
}

const DEFAULT_BUDGET = 800
const RECENT_SUMMARIES = 5
const MAX_ROWS = 200

/**
 * Session-start injection. No query, no embedding, one indexed read: an agent
 * opening a session has no search terms yet, so selection is deterministic —
 * most recently updated first, L0 for everything, L1 for the newest five.
 */
export async function buildDigest(input: DigestInput): Promise<Digest> {
  const budget = Math.max(input.budgetTokens ?? DEFAULT_BUDGET, 1)
  await requireProjectRole(input.userId, input.projectId, 'read')

  const rows = await withUser(input.userId, async (client) => {
    const { rows } = await client.query<{
      path: string
      title: string
      summary: string | null
      updated_at: Date
    }>(
      `select path, title, summary, updated_at
       from memories
       where project_id = $1 and deleted_at is null
       order by updated_at desc, path
       limit ${MAX_ROWS}`,
      [input.projectId],
    )
    return rows
  })

  if (rows.length === 0) return { text: '', memoryCount: 0, truncated: false }

  const recent = new Set(rows.slice(0, RECENT_SUMMARIES).map((row) => row.path))

  const groups = new Map<string, typeof rows>()
  for (const row of rows) {
    const top = row.path.includes('/') ? row.path.slice(0, row.path.indexOf('/')) : row.path
    const bucket = groups.get(top)
    if (bucket) bucket.push(row)
    else groups.set(top, [row])
  }

  let text = ''
  let included = 0
  let truncated = false

  outer: for (const [dir, entries] of groups) {
    const header = `### ${dir}\n`
    let emittedHeader = false

    for (const row of entries) {
      // The date is the whole point of a session-start digest: a fact from six
      // months ago and one from yesterday read the same without it.
      const day = row.updated_at.toISOString().slice(0, 10)
      const chunk = recent.has(row.path)
        ? `## ${row.path} (${day})\n${row.summary ?? row.title}\n\n`
        : `- ${row.path.includes('/') ? row.path.slice(dir.length + 1) : row.path} — ${row.title} · ${day}\n`
      const candidate = emittedHeader ? text + chunk : text + header + chunk

      if (Math.ceil(candidate.length / 4) > budget) {
        truncated = true
        break outer
      }

      text = candidate
      emittedHeader = true
      included++
    }
  }

  return { text: text.trimEnd(), memoryCount: included, truncated }
}
